/** Suggest which illness a payment or record belongs to, from the person's own diagnoses. */
const HINTS: [RegExp, RegExp][] = [
  [/diabet|a1c|glucose|sugar|metformin|glycomet|insulin/i, /diabet/i],
  [/pressure|hypertens|lisinopril|amlodipine|telmisartan|\bbp\b/i, /hypertens|pressure/i],
  [/cholesterol|ldl|lipid|statin|storvas/i, /lipid|cholesterol/i],
  [/thyroid|tsh|thyronorm|levothyrox/i, /thyroid/i],
  [/asthma|inhaler|salbutamol|asthalin/i, /asthma/i],
  [/back|spine|strain|ibuprofen|brufen/i, /back|strain/i],
  [/fever|typhoid|paracetamol|dolo/i, /typhoid|fever/i],
];

export const NOT_LINKED = 'Not linked to an illness';

export function guessIllness(text: string, illnesses: string[]): string {
  for (const [hint, cond] of HINTS) {
    if (hint.test(text)) {
      const hit = illnesses.find((n) => cond.test(n));
      if (hit) return hit;
    }
  }
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  return illnesses.find((n) => words.some((w) => n.toLowerCase().includes(w))) ?? NOT_LINKED;
}

/** Medicines that belong to the penicillin family, for allergy warnings. */
export const PENICILLIN_FAMILY = /penicillin|amoxicillin|ampicillin|augmentin|amoxyclav|mox\b|novamox/i;
