import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FanovaView, MixedEffectsView } from "./index.js";
import type { ComponentAnalysis, RankingPlotProps } from "./index.js";

const artifact: ComponentAnalysis = {
  schema_version:"n4a.component-analysis/1",state:"ready",reason:null,request_id:"design",request:{},method:"mixed_effects",metric:"nrmse",scope:"cv",partition:"validation",direction:"min",
  design:{factors:[{name:"model",dimension:"model",kind:"categorical",operator:null,operator_version:null,parameter:null,reference:"A",levels:["A","B"],bounds:null,observed_levels:["A","B"]}],columns:[{name:"Intercept",factor:null,level:null},{name:"model = B",factor:"model",level:"B"}],references:{model:"A"},domains:[{factor:"model",kind:"categorical",levels:["A","B"],bounds:null}],model_slice:null,outcome_policy:"scale_free",group_names:["dataset","dataset_evaluation_block"]},
  provenance:{source_observations:40,accepted_observations:36,excluded:{missing_actual_cv_identity:4},datasets:["D1","D2"],observations:[],baseline_observations:[],training_datasets:[],validation_datasets:[]},warnings:["Observed configurations are not causal effects."],
  result:{schema_version:"n4m.mixed_effects/1",state:"ready",reason:null,beta:[0.4,-0.2],standard_errors:[0.05,0.03],covariance:[[0.0025,0],[0,0.0009]],variances:[0.01,0.02,0.03],diagnostics:{fit_state:"fitted_boundary",condition_number:3.2,log_likelihood:12.4,converged:1,boundary:1,design_rank:2},options:{reml:true},warnings:[]},
};

describe("native component analysis views",()=>{
  it("shows exact coefficients, SE, references, covariance and variance order with an accessible alternative",()=>{
    let plot:RankingPlotProps|undefined;
    const html=renderToStaticMarkup(<MixedEffectsView analysis={artifact} Plot={props=>{plot=props;return null;}}/>);
    expect(html).toContain("Native fixed effect estimates");
    expect(html).toContain("model = B</th><td>-0.2</td><td>0.03");
    expect(html).toContain("one native coefficient standard error, not a confidence interval");
    expect(html).toContain("Negative coefficients indicate a lower response");
    expect(html).toContain("Residual</th><td>0.01");
    expect(html).toContain("dataset evaluation block</th><td>0.03");
    expect(html).toContain("Coefficient covariance in design column order");
    expect(html).toContain("fitted_boundary");
    expect(html).toContain("Converged</th><td>Yes");
    expect(html).toContain("Boundary variance estimate</th><td>Yes");
    expect(html).toContain("Design rank</th><td>2");
    expect(html).toContain("Design condition number</th><td>3.2");
    expect(html).toContain("Restricted log likelihood (REML)</th><td>12.4");
    expect(plot?.data[0]).toMatchObject({x:[0.4,-0.2],error_x:{array:[0.05,0.03]}});
    const ml = renderToStaticMarkup(<MixedEffectsView analysis={{...artifact,result:{...(artifact.result as any),options:{reml:false}}}}/>);
    expect(ml).toContain("Log likelihood (ML)</th><td>12.4");
  });
  it("keeps statistical refusals explicit without displaying provisional coefficients",()=>{
    const unavailable:ComponentAnalysis={...artifact,state:"unavailable",reason:"fixed_rank",result:{...(artifact.result as any),state:"unavailable",reason:"fixed_rank",beta:[null,null],standard_errors:[null,null]}};
    const html=renderToStaticMarkup(<MixedEffectsView analysis={unavailable}/>);
    expect(html).toContain("fixed_rank");expect(html).not.toContain("Native fixed effect estimates");
    expect(html).toContain("Design, references and domain");
    expect(html).toContain("Native mixed effect fit diagnostics");
  });
  it("shows authoritative importance fractions, tree SD, domain and heldout identities without claiming gain",()=>{
    const fanova:ComponentAnalysis={...artifact,method:"fanova",design:{...artifact.design,factors:[artifact.design.factors[0]!,{...artifact.design.factors[0]!,name:"preprocessing"}]},provenance:{...artifact.provenance,training_datasets:["D1"],validation_datasets:["D2"]},result:{schema_version:"n4m.fanova/1",state:"ready",reason:null,feature_importance:[{index:0,fraction:0.2,tree_sd:0.03},{index:1,fraction:0.7,tree_sd:0.04}],interactions:[{indices:[0,1],fraction:0.1,tree_sd:0.02}],diagnostics:{validation_rmse:0.12,validation_r2:-0.4,train_rmse:0.03,remaining_fraction:0,trees:32,informative_trees:30,total_variance_mean:0.25},domain_measure:"uniform_product",aggregation:"mean_per_tree_normalized_components",uncertainty_kind:"tree_dispersion_not_confidence",options:{seed:42},warnings:[]}};
    let plot:RankingPlotProps|undefined;
    const html=renderToStaticMarkup(<FanovaView analysis={fanova} Plot={props=>{plot=props;return null;}}/>);
    expect(html).toContain("Native main effect importance");expect(html).toContain("<td>0.2</td><td>0.03");
    expect(html).toContain("model × preprocessing</th><td>0.1</td><td>0.02");
    expect(html).toContain("does not mean a configuration improves performance");
    expect(html).toContain("Training datasets: D1. Held-out datasets: D2");
    expect(html).toContain("not a standard error or confidence interval");
    expect(html).toContain("Held-out RMSE</th><td>0.12");
    expect(html).toContain("Held-out R²</th><td>-0.4");
    expect(html).toContain("Training RMSE</th><td>0.03");
    expect(html).toContain("Informative trees</th><td>30");
    expect(html).toContain("Unreported variance fraction</th><td>0");
    expect(plot?.data[0]).toMatchObject({x:[0.2,0.7],y:["model","preprocessing"]});
  });
});
