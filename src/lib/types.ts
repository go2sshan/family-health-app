export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type Member = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  relationship: string | null;
  date_of_birth: string | null;
  sex: string | null;
  blood_group: BloodGroup | null;
  language: string | null;
  primary_doctor: string | null;
  communicate: string | null;
  care_needs: string | null;
  photo_path: string | null;
  sort_order: number;
  family_id: string | null;
  /** The login of the person this profile describes, if they have one. */
  user_id: string | null;
};

/** What the signed-in person may do with a profile. */
export type MemberRole = 'manage' | 'edit' | 'view';

export type Allergy = {
  id: string;
  member_id: string;
  kind: 'medicine' | 'food' | 'other';
  name: string;
  reaction: string | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
};

export type Measurement = { id: string; member_id: string; measured_on: string; height_cm: number | null; weight_kg: number | null };

export type EyeRx = {
  id: string;
  member_id: string;
  rx_date: string;
  r_sph: number | null; r_cyl: number | null; r_axis: number | null;
  l_sph: number | null; l_cyl: number | null; l_axis: number | null;
  add_power: number | null;
  note: string | null;
};

export type Contact = { id: string; member_id: string; name: string; relationship: string | null; phone: string };

export type RecordKind = 'visit' | 'diagnosis' | 'lab' | 'medicine' | 'vaccination' | 'procedure' | 'document' | 'allergy';

export type HealthRecord = {
  id: string;
  member_id: string;
  kind: RecordKind;
  occurred_on: string | null;
  title: string;
  provider: string | null;
  country: string | null;
  value: number | null;
  unit: string | null;
  ongoing: boolean | null;
  notes: string | null;
  source: 'manual' | 'scan' | 'import';
  confidence: 'high' | 'medium' | 'low' | null;
  record_files?: { id: string; storage_path: string; mime_type: string | null; file_name: string | null }[];
};

export type PaymentKind = 'visit' | 'medicine' | 'lab' | 'procedure' | 'vaccination' | 'other';

export type Payment = {
  id: string;
  member_id: string;
  record_id: string | null;
  paid_on: string;
  description: string;
  kind: PaymentKind;
  doctor: string | null;
  illness: string | null;
  amount_paid: number;
  insurance_paid: number | null;
  billed: number | null;
  currency: string;
  note: string | null;
  estimated: boolean;
};

export type MemberDetail = {
  member: Member;
  role: MemberRole;
  allergies: Allergy[];
  measurements: Measurement[];
  eyes: EyeRx[];
  contacts: Contact[];
  records: HealthRecord[];
  payments: Payment[];
};

export const KIND_LABEL: Record<RecordKind, string> = {
  visit: 'Visit',
  diagnosis: 'Diagnosis',
  lab: 'Lab result',
  medicine: 'Medicine',
  vaccination: 'Vaccination',
  procedure: 'Procedure',
  document: 'Document',
  allergy: 'Allergy',
};

export const RELATIONSHIPS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Grandparent', 'Other'];
export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AED'];
