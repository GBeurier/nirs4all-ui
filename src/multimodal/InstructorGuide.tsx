import { MULTIMODAL_CASES } from "./catalog.js";
import type { MultimodalCaseId, MultimodalCaseInfo } from "./types.js";

export interface InstructorGuideProps {
  caseId: MultimodalCaseId;
  cases?: readonly MultimodalCaseInfo[];
}

const DEMO_SEQUENCE: readonly string[] = [
  "Load the case's synthetic preset and read the matching table aloud: same identities, separate axes and units.",
  "Select one sample and show it in every source view: one physical sample, several windows on it.",
  "Run the single-source baselines alone first; ask the class to predict which source wins before revealing the table.",
  "Add early fusion without block scaling, then with it; discuss which block dominated and why.",
  "Add multiblock PLS and read its exact owner label; ask what the block structure preserves.",
  "Add the fixed mean and stacking; contrast nothing learned at the merge with a meta-learner trained on out-of-fold predictions.",
  "Add the trained network; discuss parameters versus samples and report the observed result, whichever way it goes.",
  "Change one source's preprocessing and show that the previous results disappear: new recipe, new run.",
  "Finish on the held-out column: a single check after refit, never a selection criterion.",
];

/** Short prompts per case, the leak-free stacking explanation and a repeatable demo sequence. */
export function InstructorGuide({ caseId, cases = MULTIMODAL_CASES }: InstructorGuideProps) {
  const current = cases.find((info) => info.id === caseId);
  return (
    <div className="n4mm-guide">
      <details className="n4mm-details" open>
        <summary>Questions for this case{current ? `: ${current.title}` : ""}</summary>
        {current ? (
          <ol className="n4mm-guide__list">
            {current.prompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ol>
        ) : null}
      </details>
      <details className="n4mm-details">
        <summary>Why stacking needs out-of-fold predictions</summary>
        <p>
          A base model predicts its own training samples too well. If a meta-learner were trained on those in-sample
          predictions, it would learn to trust the most overfitted base model. Stacked generalisation (Wolpert, 1992)
          therefore trains the meta-learner on predictions each base model made for samples it did not see.
        </p>
        <ol className="n4mm-guide__list">
          <li>Split the calibration set into outer folds. Hold one outer fold out for validation.</li>
          <li>On the remaining outer-training samples, run inner folds: each base model predicts the inner fold it did not train on.</li>
          <li>Fit the meta-learner on those inner out-of-fold predictions only.</li>
          <li>Refit the base models on the whole outer-training scope and predict the outer validation fold; the meta-learner combines them.</li>
          <li>Repeat for every outer fold to obtain out-of-fold predictions for the comparison table.</li>
          <li>For the final model, repeat the inner construction on the whole calibration set, then predict the held-out test once.</li>
        </ol>
        <p>
          A fixed mean needs none of this because it learns nothing. Every learned preprocessing step and block scaling is
          fitted inside the same training scope as the model it feeds.
        </p>
      </details>
      <details className="n4mm-details">
        <summary>Live demonstration sequence (about 15 minutes)</summary>
        <ol className="n4mm-guide__list">
          {DEMO_SEQUENCE.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="n4mm-note">
          Synthetic data show a mechanism. They do not establish that one fusion strategy is better on real samples, where
          sample size, groups and population shift often matter more than architecture.
        </p>
      </details>
    </div>
  );
}
