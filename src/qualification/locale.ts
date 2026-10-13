import { loc, type Locale, type LocalizedText } from '../lab/locale.js';
import type { AvailabilityStatus, ProfileStatus, QualificationConfidence, QualificationSeverity } from './types.js';

export const PROFILE_STATUS_LABEL: Record<ProfileStatus, LocalizedText> = {
  exploratory: { fr: 'Exploratoire', en: 'Exploratory' },
  partial: { fr: 'Partiel', en: 'Partial' },
  complete: { fr: 'Complet', en: 'Complete' },
};

export const PROFILE_STATUS_HINT: Record<ProfileStatus, LocalizedText> = {
  exploratory: {
    fr: 'Protocoles alpha non qualifiés : résultats indicatifs, sans seuil calibré.',
    en: 'Unqualified alpha protocols: indicative results, no calibrated thresholds.',
  },
  partial: {
    fr: 'Une partie des diagnostics est indisponible ; voir le tableau des preuves.',
    en: 'Some diagnostics are unavailable; see the evidence table.',
  },
  complete: { fr: 'Tous les diagnostics du profil sont disponibles.', en: 'All diagnostics of the profile are available.' },
};

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, LocalizedText> = {
  computed: { fr: 'Calculé', en: 'Computed' },
  not_applicable: { fr: 'Non applicable', en: 'Not applicable' },
  insufficient_data: { fr: 'Données insuffisantes', en: 'Insufficient data' },
  unsupported: { fr: 'Non supporté', en: 'Unsupported' },
  not_identifiable: { fr: 'Non identifiable', en: 'Not identifiable' },
  undefined: { fr: 'Indéfini', en: 'Undefined' },
  cancelled: { fr: 'Annulé', en: 'Cancelled' },
  error: { fr: 'Erreur', en: 'Error' },
};

export const CONFIDENCE_LABEL: Record<QualificationConfidence, LocalizedText> = {
  unknown: { fr: 'Confiance inconnue', en: 'Unknown confidence' },
  low: { fr: 'Confiance faible', en: 'Low confidence' },
  medium: { fr: 'Confiance moyenne', en: 'Medium confidence' },
  high: { fr: 'Confiance élevée', en: 'High confidence' },
};

export const SEVERITY_LABEL: Record<QualificationSeverity, LocalizedText> = {
  info: { fr: 'Information', en: 'Information' },
  warning: { fr: 'Attention', en: 'Warning' },
  high: { fr: 'Élevée', en: 'High' },
  blocking: { fr: 'Bloquant', en: 'Blocking' },
};

export const QUALIFICATION_TEXT = {
  notAvailable: { fr: 'non disponible', en: 'not available' },
  metric: { fr: 'Indicateur', en: 'Metric' },
  status: { fr: 'Statut', en: 'Status' },
  value: { fr: 'Valeur', en: 'Value' },
  scope: { fr: 'Portée', en: 'Scope' },
  denominators: { fr: 'Dénominateurs', en: 'Denominators' },
  provenance: { fr: 'Provenance', en: 'Provenance' },
  reason: { fr: 'Raison', en: 'Reason' },
  source: { fr: 'Source', en: 'Source' },
  target: { fr: 'Cible', en: 'Target' },
  population: { fr: 'Population', en: 'Population' },
  view: { fr: 'Vue', en: 'View' },
  capability: { fr: 'Capacité', en: 'Capability' },
  available: { fr: 'Disponible', en: 'Available' },
  qualified: { fr: 'Qualifiée', en: 'Qualified' },
  yes: { fr: 'oui', en: 'yes' },
  no: { fr: 'non', en: 'no' },
  evidence: { fr: 'Preuves', en: 'Evidence' },
  action: { fr: 'Action', en: 'Action' },
  limitations: { fr: 'Limites', en: 'Limitations' },
  noFindings: { fr: 'Aucun constat émis par le moteur.', en: 'The engine emitted no findings.' },
  dataTable: { fr: 'Données du graphique', en: 'Chart data' },
  count: { fr: 'Nombre', en: 'Count' },
  engine: { fr: 'Moteur', en: 'Engine' },
  protocol: { fr: 'Protocoles', en: 'Protocols' },
  schema: { fr: 'Schéma', en: 'Schema' },
  issues: { fr: 'Problèmes de validation', en: 'Validation issues' },
  blocking: { fr: 'bloquant', en: 'blocking' },
  nonBlocking: { fr: 'non bloquant', en: 'non-blocking' },
  parameters: { fr: 'Paramètres', en: 'Parameters' },
} as const satisfies Record<string, { fr: string; en: string }>;

/** Human labels for engine metric ids; unknown ids fall back to the raw id. */
export const METRIC_LABEL: Record<string, LocalizedText> = {
  'population.development_real_samples': { fr: 'Échantillons de développement réels', en: 'Real development samples' },
  'population.retained_test_samples': { fr: 'Échantillons de test réservé', en: 'Retained test samples' },
  'population.augmented_samples_excluded': { fr: 'Échantillons augmentés exclus', en: 'Excluded augmented samples' },
  'integrity.missing_cells': { fr: 'Cellules manquantes', en: 'Missing cells' },
  'integrity.axis_order': { fr: "Ordre de l'axe spectral", en: 'Spectral axis order' },
  'integrity.development_observations': { fr: 'Observations de développement', en: 'Development observations' },
  'integrity.cross_physical_exact_duplicate_pairs': { fr: 'Doublons exacts entre objets physiques', en: 'Exact duplicates across physical objects' },
  'integrity.cross_partition_exact_duplicate_pairs': { fr: 'Doublons exacts développement ↔ test', en: 'Exact duplicates development ↔ test' },
  'structure.eligible_samples': { fr: 'Unités éligibles à la structure', en: 'Units eligible for structure' },
  'structure.pca': { fr: 'ACP', en: 'PCA' },
  'structure.pca_eigenvalues': { fr: 'Valeurs propres ACP', en: 'PCA eigenvalues' },
  'structure.full_variance_moments': { fr: 'Moments de variance complets', en: 'Full variance moments' },
  'structure.explained_variance_retained': { fr: 'Variance retenue', en: 'Retained variance' },
  'structure.pca_scores': { fr: 'Scores ACP', en: 'PCA scores' },
  'structure.effective_dimension': { fr: 'Dimension effective', en: 'Effective dimension' },
  'local.global_contrast': { fr: 'Contraste local X → Y', en: 'Local X → Y contrast' },
  'local.descriptive': { fr: 'Contraste local descriptif', en: 'Descriptive local contrast' },
  'measurement.repeatability_sd': { fr: 'Écart-type de répétabilité', en: 'Repeatability SD' },
  'measurement.icc_1_1': { fr: 'ICC(1,1) par bande', en: 'Per-band ICC(1,1)' },
  'target.coverage': { fr: 'Couverture de la cible', en: 'Target coverage' },
  'target.exact_eligible_samples': { fr: 'Références exactes éligibles', en: 'Eligible exact references' },
  'target.continuous_distribution': { fr: 'Distribution de la cible', en: 'Target distribution' },
  'target.class_counts': { fr: 'Effectifs par classe', en: 'Class counts' },
  'target.local_contradiction_test': { fr: 'Test de contradiction locale', en: 'Local contradiction test' },
};

/** Human labels for engine capability ids; unknown ids fall back to the raw id. */
export const CAPABILITY_LABEL: Record<string, LocalizedText> = {
  integrity: { fr: 'Intégrité et identités', en: 'Integrity and identities' },
  'target.coverage': { fr: 'Couverture de la cible', en: 'Target coverage' },
  'methods.pca': { fr: 'ACP (Methods)', en: 'PCA (Methods)' },
  'methods.repeatability': { fr: 'Répétabilité (Methods)', en: 'Repeatability (Methods)' },
  'methods.summary': { fr: 'Résumés statistiques (Methods)', en: 'Statistical summaries (Methods)' },
  'methods.nearest_neighbors': { fr: 'Plus proches voisins (Methods)', en: 'Nearest neighbours (Methods)' },
  'methods.local_contrast': { fr: 'Contraste local (Methods)', en: 'Local contrast (Methods)' },
  'local.descriptive': { fr: 'Contraste local descriptif', en: 'Descriptive local contrast' },
  validation_probe: { fr: 'Sondes de validation imbriquées', en: 'Nested validation probes' },
  clustering: { fr: 'Clustering', en: 'Clustering' },
  confounding: { fr: 'Facteurs de confusion', en: 'Confounding' },
  domain_shift: { fr: 'Dérive de domaine', en: 'Domain shift' },
  noise_proxy: { fr: 'Indicateurs de bruit', en: 'Noise proxies' },
  repeatability_uncertainty: { fr: 'Incertitude de répétabilité', en: 'Repeatability uncertainty' },
  snv_sensitivity: { fr: 'Sensibilité SNV', en: 'SNV sensitivity' },
  quasi_duplicates: { fr: 'Quasi-doublons', en: 'Near duplicates' },
  metadata_association_tests: { fr: "Tests d'association des métadonnées", en: 'Metadata association tests' },
};

export function metricLabel(id: string, locale: Locale = 'fr'): string {
  const text = METRIC_LABEL[id];
  return text ? loc(text, locale) : id;
}

export function capabilityLabel(id: string, locale: Locale = 'fr'): string {
  const text = CAPABILITY_LABEL[id];
  return text ? loc(text, locale) : id;
}

/** Labels of the presentation charts (flows, profiles, scree, score map, distributions). */
export const CHART_TEXT = {
  observations: { fr: 'observations', en: 'observations' },
  samples: { fr: 'échantillons', en: 'samples' },
  units: { fr: 'unités', en: 'units' },
  groups: { fr: 'groupes physiques', en: 'physical groups' },
  stageSource: { fr: 'Observations de la source', en: 'Source observations' },
  stageDevelopment: { fr: 'Observations de développement', en: 'Development observations' },
  stageUnits: { fr: 'Unités agrégées pour la structure', en: 'Aggregated structure units' },
  segDevelopment: { fr: 'Développement réel', en: 'Real development' },
  segOther: { fr: 'Test réservé, prédiction ou augmentées', en: 'Retained test, prediction or augmented' },
  segUsed: { fr: 'Retenues', en: 'Kept' },
  segAmbiguous: { fr: 'Répétition ambiguë', en: 'Ambiguous repeat' },
  segIncomplete: { fr: 'Incomplètes', en: 'Incomplete' },
  segMulticontext: { fr: 'Multi-contexte', en: 'Multi-context' },
  segUnits: { fr: 'Objet physique × instrument × campagne', en: 'Physical object × instrument × campaign' },
  stageSamples: { fr: 'Échantillons déclarés', en: 'Declared samples' },
  segRetained: { fr: 'Test réservé', en: 'Retained test' },
  segAugmented: { fr: 'Augmentés exclus', en: 'Excluded augmented' },
  band: { fr: 'Bande', en: 'Band' },
  pooledSd: { fr: 'Écart-type poolé', en: 'Pooled SD' },
  icc: { fr: 'ICC(1,1)', en: 'ICC(1,1)' },
  bandNotComputed: { fr: 'bande non calculable', en: 'band not computable' },
  bandStatus1: { fr: 'répétitions insuffisantes', en: 'insufficient repeats' },
  bandStatus2: { fr: 'déséquilibrée', en: 'unbalanced' },
  bandStatus3: { fr: 'variance totale nulle', en: 'zero total variance' },
  component: { fr: 'Composante', en: 'Component' },
  eigenvalue: { fr: 'Valeur propre', en: 'Eigenvalue' },
  shareOfTrace: { fr: 'Part de la trace', en: 'Share of trace' },
  cumulative: { fr: 'Cumul', en: 'Cumulative' },
  scoreMap: { fr: 'Carte des scores', en: 'Score map' },
  noValue: { fr: 'sans valeur', en: 'no value' },
  min: { fr: 'Min', en: 'Min' },
  q25: { fr: 'Q1', en: 'Q1' },
  median: { fr: 'Médiane', en: 'Median' },
  q75: { fr: 'Q3', en: 'Q3' },
  max: { fr: 'Max', en: 'Max' },
  mean: { fr: 'Moyenne', en: 'Mean' },
  sd: { fr: 'Écart-type', en: 'SD' },
  count: { fr: 'Effectif', en: 'Count' },
  exact: { fr: 'Référence exacte', en: 'Exact reference' },
  censored: { fr: 'Censurée (exclue)', en: 'Censored (excluded)' },
  composite: { fr: 'Composite (exclue)', en: 'Composite (excluded)' },
  available: { fr: 'Disponible, non qualifiée', en: 'Available, unqualified' },
  qualified: { fr: 'Qualifiée', en: 'Qualified' },
  unavailable: { fr: 'Indisponible', en: 'Unavailable' },
  spectra: { fr: 'spectres', en: 'spectra' },
  missingValue: { fr: 'valeur manquante', en: 'missing value' },
  checkOk: { fr: 'OK', en: 'OK' },
  checkAttention: { fr: 'À examiner', en: 'Review' },
  checkCritical: { fr: 'Critique', en: 'Critical' },
  checkUnavailable: { fr: 'Non évalué', en: 'Not assessed' },
  see: { fr: 'Voir', en: 'View' },
} as const satisfies Record<string, LocalizedText>;
