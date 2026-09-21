/**
 * Provider registry.
 *
 * One place decides which implementation is live, based on environment
 * variables. Everything above this module (booking engine, routes, admin
 * actions) depends on the interfaces only. The admin console renders
 * `providerStatuses()` so an operator can see exactly which channels are real
 * and which are not - no channel is ever described as live when it is not.
 */
import { getSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import { DEFAULT_WHATSAPP_NUMBER } from "@/lib/whatsapp/message";
import { SupabaseStorage } from "./storage";
import {
  ProviderNotConfiguredError,
  type EmailMessage,
  type EmailProvider,
  type MeetingInput,
  type MeetingResult,
  type NotificationPayload,
  type NotificationProvider,
  type PaymentInstruction,
  type PaymentProvider,
  type PaymentRecordInput,
  type ProviderStatus,
  type StorageProvider,
  type VideoMeetingProvider,
  type WhatsAppProvider,
} from "./types";

// ---------------------------------------------------------------------------
// Payment - v1 manual BenefitPay
// ---------------------------------------------------------------------------
export class ManualBenefitPayProvider implements PaymentProvider {
  readonly status: ProviderStatus = {
    id: "manual_benefitpay",
    label: "Manual BenefitPay (v1)",
    configured: true,
  };

  async createPayment(input: PaymentRecordInput): Promise<PaymentInstruction> {
    const settings = await getSettings();
    return {
      method: "manual_benefitpay",
      destination: settings.benefitPayNumber,
      amount: input.amount,
      currency: "BHD",
      referenceCode: input.referenceCode,
      whatsappNumber: settings.whatsappNumber || DEFAULT_WHATSAPP_NUMBER,
      instructions: {
        ar: `يرجى إتمام الدفع عبر بنفت بي وإرسال إثبات التحويل على واتساب.\nالمبلغ: ${input.amount} د.ب\nرقم الطلب: ${input.referenceCode}`,
        en: `Please complete the payment through BenefitPay and send the payment confirmation/proof through WhatsApp.\nAmount: BHD ${input.amount}\nBooking ID: ${input.referenceCode}`,
      },
    };
  }

  async confirmManually(paymentId: string, adminUserId: string, reference?: string): Promise<void> {
    await query(
      `update payments
          set status = 'verified', verified_by = $2, verified_at = now(),
              customer_reference = coalesce($3, customer_reference)
        where id = $1 and status in ('pending', 'submitted')`,
      [paymentId, adminUserId, reference ?? null],
    );
  }

  async refundManually(paymentId: string, adminUserId: string, reason: string): Promise<void> {
    await query(
      `update payments
          set status = 'refunded', admin_notes = coalesce(admin_notes, '') || $3, verified_by = $2,
              verified_at = coalesce(verified_at, now())
        where id = $1`,
      [paymentId, adminUserId, `\n[refund:${new Date().toISOString()}] ${reason}`],
    );
  }
}

// ---------------------------------------------------------------------------
// Notifications - v1 in-app rows only
// ---------------------------------------------------------------------------
export class InAppNotificationProvider implements NotificationProvider {
  readonly status: ProviderStatus = {
    id: "in_app",
    label: "In-app notifications",
    configured: true,
  };

  async send(payload: NotificationPayload): Promise<void> {
    await query(
      `insert into notifications (user_id, type, params, channel, entity_type, entity_id)
       values ($1, $2, $3, 'in_app', $4, $5)`,
      [payload.userId, payload.type, JSON.stringify(payload.params), payload.entityType ?? null, payload.entityId ?? null],
    );
  }

  async sendMany(payloads: NotificationPayload[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const payload of payloads) {
      try {
        await this.send(payload);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed };
  }
}

// ---------------------------------------------------------------------------
// Email / WhatsApp / SMS - wired but NOT enabled in v1
// ---------------------------------------------------------------------------
export class UnconfiguredEmailProvider implements EmailProvider {
  readonly status: ProviderStatus = {
    id: "email_disabled",
    label: "Email delivery",
    configured: false,
    reason: "No transactional email provider is configured for this deployment",
  };

  async send(_message: EmailMessage): Promise<void> {
    throw new ProviderNotConfiguredError("email", this.status.reason ?? "not configured");
  }
}

export class DeepLinkWhatsAppProvider implements WhatsAppProvider {
  readonly status: ProviderStatus = {
    id: "whatsapp_deeplink",
    label: "WhatsApp deep link (customer sends)",
    configured: true,
    reason: "The platform opens a wa.me conversation; it never sends a message on the customer's behalf",
  };

  deepLink(to: string, body: string): string {
    const digits = to.replace(/[^\d]/g, "");
    return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
  }
}

// ---------------------------------------------------------------------------
// Video - v1 manually pasted Zoom link
// ---------------------------------------------------------------------------
export class ManualZoomProvider implements VideoMeetingProvider {
  readonly status: ProviderStatus = {
    id: "manual_zoom",
    label: "Manual Zoom links",
    configured: true,
    reason: "The tutor or an admin pastes the meeting link; no room is created by the platform",
  };

  async prepare(_input: MeetingInput): Promise<MeetingResult | null> {
    return null;
  }

  validateLink(link: string): boolean {
    try {
      const url = new URL(link);
      if (url.protocol !== "https:") return false;
      return /(^|\.)zoom\.us$/.test(url.hostname) || url.hostname === "meet.google.com" || url.hostname === "teams.microsoft.com";
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
let payment: PaymentProvider | null = null;
let notifications: NotificationProvider | null = null;
let email: EmailProvider | null = null;
let whatsapp: WhatsAppProvider | null = null;
let video: VideoMeetingProvider | null = null;
let storage: StorageProvider | null = null;

export function paymentProvider(): PaymentProvider {
  payment ??= new ManualBenefitPayProvider();
  return payment;
}

export function notificationProvider(): NotificationProvider {
  notifications ??= new InAppNotificationProvider();
  return notifications;
}

export function emailProvider(): EmailProvider {
  email ??= new UnconfiguredEmailProvider();
  return email;
}

export function whatsappProvider(): WhatsAppProvider {
  whatsapp ??= new DeepLinkWhatsAppProvider();
  return whatsapp;
}

export function videoProvider(): VideoMeetingProvider {
  video ??= new ManualZoomProvider();
  return video;
}

export function storageProvider(): StorageProvider {
  storage ??= new SupabaseStorage();
  return storage;
}

export function storageConfigured(): boolean {
  return storageProvider().status.configured;
}

/** Shown in the admin console so nobody has to guess what is live. */
export function providerStatuses(): ProviderStatus[] {
  return [
    paymentProvider().status,
    notificationProvider().status,
    whatsappProvider().status,
    emailProvider().status,
    videoProvider().status,
    storageProvider().status,
  ];
}

export * from "./types";
