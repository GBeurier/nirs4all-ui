# Public inspector examples

Ten real owner-executed demonstration bundles. These are not reproductions of the source publications.

Open 04 and attach 09 to replay a fitted multi-stage pipeline on 34 unlabelled spectra. Open 02 and attach 01 to run one of the three stored pipelines on source data.

Walnut keeps origin calibration/test assignments. Milk keeps every cow together in the holdout and CV folds (177 train observations, 63 heldout, 39 cows total). The grouped folds are intentionally not claimed as balanced. Soil contains 160 distinct layers; selection uses unweighted multi-output RMSE and target-specific metrics remain separate.

| Bundle | Scenario |
| --- | --- |
| 01-data-share.n4a | 136 spectra, source targets and original calibration / prediction split. No fitted model. |
| 02-recipe-library.n4a | Three stored plans with three candidate settings each. Compare Savitzky–Golay derivative → SNV → scaling → PLS, MSC → detrending → smoothing → PLS, and detrending → smoothing → scaling → Ridge. Training data is a reference. |
| 03-walnut-analysis.n4a | Savitzky–Golay derivative → SNV → scaling → PLS, with three candidates, three CV folds, OOF selection, full refit and the original holdout. |
| 04-deployment-model.n4a | A portable fitted Savitzky–Golay derivative → SNV → scaling → PLS model with evaluation evidence. Attach a data bundle for prediction. |
| 05-preprocessing-campaign.n4a | Three multi-stage pipelines and a raw PLS baseline, with a shared dataset, candidate/fold scores and stored OOF predictions. |
| 06-milk-benchmark.n4a | Savitzky–Golay smoothing → SNV → scaling → PLS, with four candidates, cow-grouped CV and holdout, and stored OOF evidence. Heldout predictions are replayed on demand. |
| 07-soil-multitarget.n4a | Savitzky–Golay derivative → SNV → scaling → two-output PLS on 160 distinct soil layers. Selection uses the owner’s unweighted multi-output RMSE. Target-specific scores remain separate. |
| 08-results-review.n4a | Stored scores from walnut and milk; prediction-cache inventories are explicitly empty. Source datasets are references; no training spectra or fitted models. |
| 09-prediction-cohort.n4a | 34 real source spectra with labels intentionally withheld; attach to the deployment model to replay its fitted state. |
| 10-multi-study-campaign.n4a | Five multi-stage pipelines and a raw PLS baseline across three datasets, with distinct evaluation contexts. |

## Sources and licenses

Peng, Dan (2021). Spectra of walnut kernel for moisture content measurement. Dryad. doi:10.5061/dryad.xksn02vfp.
Source: https://doi.org/10.5061/dryad.xksn02vfp. License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Diaz-Olivares, Jose A.; van Nuenen, Arnout; Gote, Martin J.; Fonseca Diaz, Valeria; Saeys, Wouter; Adriaens, Ines; Aernouts, Ben (2023). Near-infrared spectra dataset of milk composition in transmittance mode. Zenodo. doi:10.5281/zenodo.8263430.
Source: https://zenodo.org/records/8263430. License: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

Sanderman, Jonathan; Partida, Colleen; Safanelli, José Lucas; Mitu, Sadia Mannan; Ge, Yufeng; Murad, Omar; Shepherd, Keith (2024). Near-infrared (NIR) soil spectral library using the NeoSpectra Handheld NIR Analyzer by Si-Ware. Zenodo. doi:10.5281/zenodo.13122321.
Source: https://zenodo.org/records/13122321. License: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

Each .n4a embeds attribution and preparation notes. Training spectra can be omitted while public training IDs/OOF labels/predictions remain; the model-only example is not anonymized. Empty cache inventories are labelled explicitly. Heldout predictions are produced by replay; they are not claimed as persisted in the original bundle.
