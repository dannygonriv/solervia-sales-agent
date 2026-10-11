import { z } from "zod";
export const statuses = [
  "Nuevo",
  "Investigando",
  "Pendiente de revisión",
  "Aprobado para contacto",
  "Contactado",
  "Sin respuesta",
  "Interesado",
  "Reunión propuesta",
  "Reunión confirmada",
  "No interesado",
  "Cliente",
  "No contactar",
] as const;
export type Mode = "demo" | "production";
export const blank = z
  .string()
  .trim()
  .max(3000)
  .nullish()
  .transform((v) => v || null);
export const uuid = z.string().uuid();
export const companyInput = z.object({
  name: z.string().trim().min(2).max(200),
  legal_name: blank,
  sector: blank,
  activity: blank,
  size: blank,
  address: blank,
  city: z.string().max(150).default("Guadalajara"),
  state: z.string().max(100).default("Jalisco"),
  website: blank.refine(
    (v) => !v || /^https?:\/\//i.test(v),
    "Usa una URL https://",
  ),
  linkedin: blank,
  source: z.string().min(2).max(300),
  source_id: blank,
  contact_name: blank,
  email: z
    .union([z.email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v?.toLowerCase() || null),
  phone: blank,
  demo: z.boolean().default(true),
});
export const contactInput = z
  .object({
    email_allowed: z.boolean(),
    call_allowed: z.boolean(),
    legal_basis: z.string().trim().max(2000),
    evidence: z.string().trim().max(3000),
    expires_at: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (v) =>
      !(v.email_allowed || v.call_allowed) ||
      (v.legal_basis.length >= 10 && v.evidence.length >= 10),
    "Documenta la base y la evidencia (mínimo 10 caracteres).",
  );
export const prospectInput = z.object({
  status: z.enum(statuses),
  notes: z.string().max(10000),
  next_action: blank,
  followup_at: z.iso.datetime().nullable(),
  product_id: uuid.nullable(),
});
export const productInput = z.object({
  name: z.string().min(2).max(160),
  line: z.enum(["Products", "Custom"]),
  description: z.string().min(10).max(5000),
  price: blank,
  active: z.boolean().default(true),
});
export const scriptInput = z.object({
  product_id: uuid,
  name: z.string().min(2).max(150),
  audience: z.string().min(2).max(2000),
  opening: z.string().min(10).max(2000),
  value_proposition: z.string().min(10).max(3000),
  questions: z.string().min(5).max(3000),
  objections: z.string().max(3000),
  allowed_answers: z.string().min(10).max(5000),
  goal: z.string().min(5).max(2000),
  max_seconds: z.number().int().min(30).max(600),
  end_conditions: z.string().min(5).max(2000),
});
export const campaignInput = z
  .object({
    name: z.string().min(2).max(150),
    product_id: uuid,
    script_id: uuid.nullable(),
    channel: z.enum(["email", "call"]),
    prospect_ids: z.array(uuid).min(1).max(500),
    max_contacts: z.number().int().min(1).max(500),
    budget: z.number().positive().max(100000),
    starts_at: z.iso.datetime(),
    start_hour: z.number().int().min(0).max(23),
    end_hour: z.number().int().min(1).max(24),
  })
  .refine(
    (v) => v.end_hour > v.start_hour,
    "El horario final debe ser posterior.",
  );
export const settingsInput = z
  .object({
    mode: z.enum(["demo", "production"]),
    emergency: z.boolean(),
    company_name: z.string().min(2).max(100),
    sender_identity: z.string().max(1000),
    privacy_notice: z.string().max(10000),
    daily_budget: z.number().positive().max(100000),
    daily_calls: z.number().int().min(0).max(500),
    daily_emails: z.number().int().min(0).max(500),
    max_attempts: z.number().int().min(1).max(5),
    cooldown_hours: z.number().min(24).max(8760),
    start_hour: z.number().int().min(0).max(23),
    end_hour: z.number().int().min(1).max(24),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    city: z.string().min(2).max(150),
    sectors: z.string().max(2000),
    call_minute_cost: z.number().min(0.01).max(100),
    email_cost: z.number().min(0.001).max(10),
    ai_request_cap: z.number().min(0.01).max(10),
    retention_days: z.number().int().min(7).max(3650),
    notification_types: z.array(
      z.enum([
        "priority",
        "call",
        "interest",
        "meeting",
        "campaign",
        "error",
        "budget",
      ]),
    ),
    email_template: z.string().max(5000),
  })
  .refine((v) => v.end_hour > v.start_hour, "Horario inválido");
export type Settings = z.infer<typeof settingsInput>;
export const defaultSettings: Settings = {
  mode: "demo",
  emergency: false,
  company_name: "Solervia",
  sender_identity: "",
  privacy_notice: "",
  daily_budget: 10,
  daily_calls: 5,
  daily_emails: 10,
  max_attempts: 2,
  cooldown_hours: 72,
  start_hour: 9,
  end_hour: 18,
  timezone: "America/Mexico_City",
  city: "Guadalajara",
  sectors: "",
  call_minute_cost: 0.25,
  email_cost: 0.01,
  ai_request_cap: 0.05,
  retention_days: 90,
  notification_types: [
    "priority",
    "call",
    "interest",
    "meeting",
    "campaign",
    "error",
    "budget",
  ],
  email_template:
    "Hola, equipo de {{empresa}}. Soy el asistente virtual de Solervia. Nos gustaría conversar sobre {{producto}}. ¿Les parece útil una breve reunión para conocer sus necesidades?",
};
export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  sector: string | null;
  activity: string | null;
  size: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  linkedin: string | null;
  source: string;
  source_id: string | null;
  demo: boolean;
  consulted_at: string;
}
export interface Analysis {
  score: number;
  recommendation: string;
  verified_facts: string[];
  hypotheses: string[];
  questions: string[];
  reason: string;
}
export interface Prospect extends Company {
  company_id: string;
  contact_id: string;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  email_allowed: boolean;
  call_allowed: boolean;
  legal_basis: string | null;
  evidence: string | null;
  expires_at: string | null;
  status: (typeof statuses)[number];
  score: number | null;
  analysis: Analysis | null;
  product_id: string | null;
  notes: string;
  next_action: string | null;
  followup_at: string | null;
  created_at: string;
}
export interface Product {
  id: string;
  name: string;
  line: string;
  description: string;
  price: string | null;
  active: boolean;
}
export interface Script {
  id: string;
  product_id: string;
  name: string;
  audience: string;
  opening: string;
  value_proposition: string;
  questions: string;
  objections: string;
  allowed_answers: string;
  goal: string;
  max_seconds: number;
  end_conditions: string;
}
export interface Campaign {
  id: string;
  name: string;
  product_id: string;
  script_id: string | null;
  channel: "email" | "call";
  status: string;
  max_contacts: number;
  budget: number;
  starts_at: string;
  start_hour: number;
  end_hour: number;
  demo: boolean;
  approved_at: string | null;
}
export interface Email {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  subject: string;
  body: string;
  status: string;
  approved_at: string | null;
  provider_id: string | null;
  reply: string | null;
  cost: number;
  demo: boolean;
  created_at: string;
}
export interface Call {
  id: string;
  prospect_id: string;
  provider_id: string | null;
  status: string;
  duration_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  interest: string | null;
  objections: string | null;
  next_action: string | null;
  cost: number;
  demo: boolean;
  created_at: string;
}
export interface Meeting {
  id: string;
  prospect_id: string;
  product_id: string | null;
  starts_at: string;
  ends_at: string;
  summary: string | null;
  status: string;
  provider_id: string | null;
  demo: boolean;
}
export interface Job {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  unique_key: string;
  attempts: number;
  error: string | null;
  demo: boolean;
  run_at: string;
}
export interface Activity {
  id: string;
  prospect_id: string | null;
  kind: string;
  description: string;
  demo: boolean;
  created_at: string;
}
export interface Notification {
  id: string;
  kind: string;
  message: string;
  status: string;
  demo: boolean;
  created_at: string;
}
export interface SearchFilters {
  keyword: string;
  state_code: string;
  municipality: string;
  sector: string;
  activity: string;
  size: string;
  city: string;
  page: number;
}
export interface AppState {
  settings: Settings;
  prospects: Prospect[];
  products: Product[];
  scripts: Script[];
  campaigns: Campaign[];
  emails: Email[];
  calls: Call[];
  meetings: Meeting[];
  activities: Activity[];
  jobs: Job[];
  notifications: Notification[];
  suppression: { id: string; value: string; reason: string }[];
  integrations: { name: string; configured: boolean; detail: string }[];
  searches: {
    id: string;
    name: string;
    active: boolean;
    next_run: string;
    interval_hours: number;
  }[];
  costs: { reserved: number; actual: number };
}
