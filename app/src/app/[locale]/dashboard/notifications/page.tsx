import { NotificationPanel } from "@/components/account/NotificationPanel";
import { requirePageSession } from "@/lib/auth/server";
import { listNotifications, unreadCount } from "@/lib/notifications/service";
import { notificationHref } from "@/lib/notifications/catalog";
import { renderNotification } from "@/lib/notifications/templates";
import { dbConfigured } from "@/lib/db";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/dashboard/notifications (§17).
 *
 * Copy is generated from the type at read time, in the reader's locale, and the
 * link target comes from the same catalogue - so a new notification type cannot
 * render as a dead row with no destination.
 */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  const t = createTranslator(locale);

  let rows: Awaited<ReturnType<typeof listNotifications>> = [];
  let unread = 0;
  if (gate.ok && dbConfigured()) {
    try {
      [rows, unread] = await Promise.all([listNotifications(gate.session.user.id, 60), unreadCount(gate.session.user.id)]);
    } catch {
      rows = [];
    }
  }

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("notifications.title")}
        </h1>
        <p className="field__hint">{t("reminder.note")}</p>
      </div>

      <NotificationPanel
        locale={locale}
        unread={unread}
        items={rows.map((row) => {
          const content = renderNotification(row.type, row.params, locale);
          return {
            id: row.id,
            type: row.type,
            readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
            createdAt: new Date(row.createdAt).toISOString(),
            title: content.title,
            body: content.body,
            href: notificationHref(locale, row.type, row.entityId),
          };
        })}
      />
    </div>
  );
}
