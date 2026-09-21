/**
 * Provider abstractions (§14).
 *
 * The booking and subscription logic depends on these interfaces, never on a
 * concrete implementation, so the v1 manual workflows can be replaced by real
 * integrations without touching business logic:
 *
 *   PaymentProvider      -> v1 ManualBenefitPayProvider  | future online gateway
 *   NotificationProvider -> v1 in-app rows               | future push/SMS/WhatsApp
 *   EmailProvider        -> v1 disabled (reports why)    | future transactional email
 *   WhatsAppProvider     -> v1 deep link (customer sends)| future WhatsApp Cloud API
 *   VideoMeetingProvider -> v1 manually pasted Zoom link | future API-created rooms
 *   StorageProvider      -> Supabase Storage via REST    | future any S3-compatible
 */

export interface ProviderStatus {
  id: string;
  label: string;
  /** true only when the provider can actually do its job in this deployment */
  configured: boolean;
  /** what the customer/admin sees when it is not configured */
  reason?: string;
}

// ---------------------------------------------------------------------------
export interface PaymentRecordInput {
  bookingId: string;
  amount: string;
  currency: "BHD";
  referenceCode: string;
  payerUserId: string;
}

export interface PaymentInstruction {
  method: "manual_benefitpay";
  /** number the customer transfers to */
  destination: string;
  amount: string;
  currency: "BHD";
  referenceCode: string;
  /** copy shown to the customer, in both languages */
  instructions: { ar: string; en: string };
  whatsappNumber: string;
}

export interface PaymentProvider {
  readonly status: ProviderStatus;
  /** Instructions for the customer; no charge is taken by the platform in v1. */
  createPayment(input: PaymentRecordInput): Promise<PaymentInstruction>;
  /** Verification is manual by an admin; this records who and when. */
  confirmManually(paymentId: string, adminUserId: string, reference?: string): Promise<void>;
  refundManually(paymentId: string, adminUserId: string, reason: string): Promise<void>;
}

// ---------------------------------------------------------------------------
export interface NotificationPayload {
  userId: string;
  /** stable type key: booking.new_request, payment.verified, ... */
  type: string;
  params: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
}

export interface NotificationProvider {
  readonly status: ProviderStatus;
  send(payload: NotificationPayload): Promise<void>;
  sendMany(payloads: NotificationPayload[]): Promise<{ sent: number; failed: number }>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly status: ProviderStatus;
  send(message: EmailMessage): Promise<void>;
}

export interface WhatsAppMessage {
  to: string;
  body: string;
}

export interface WhatsAppProvider {
  readonly status: ProviderStatus;
  /**
   * v1: returns the wa.me deep link the customer opens themselves. No message
   * is ever sent by the platform, and nothing is claimed to have been
   * delivered to WhatsApp.
   */
  deepLink(to: string, body: string): string;
}

export interface MeetingInput {
  bookingId: string;
  code: string;
  startsAt: Date;
  durationMinutes: number;
  subject: string;
}

export interface MeetingResult {
  joinUrl: string;
  provider: string;
  note?: string;
}

export interface VideoMeetingProvider {
  readonly status: ProviderStatus;
  /** v1: no room is created; the link is pasted by the tutor/admin and stored. */
  prepare(input: MeetingInput): Promise<MeetingResult | null>;
  validateLink(link: string): boolean;
}

// ---------------------------------------------------------------------------
export interface StoredObject {
  path: string;
  url?: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface StorageProvider {
  readonly status: ProviderStatus;
  /** Public bucket (tutor avatars, marketing assets). */
  putPublic(path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Private bucket (tutor documents, payment proofs) - never a public URL. */
  putPrivate(path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Time-limited read link for a private object. */
  signedUrl(path: string, expiresInSeconds: number): Promise<SignedUrl>;
  remove(path: string, bucket?: "public" | "private"): Promise<void>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(readonly provider: string, reason: string) {
    super(`${provider} is not configured: ${reason}`);
    this.name = "ProviderNotConfiguredError";
  }
}
