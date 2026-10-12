import type { LocalizedText } from '../lab/locale.js';
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
