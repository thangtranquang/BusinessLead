import { Controller, Get, Header, HttpCode, Param, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";
import { verifyUnsubscribe } from "./email-utils";

/** One piece of page text in both languages. Vietnamese first; the English part is marked lang="en" in the page. */
interface Copy { readonly vi: string; readonly en: string }

/**
 * The public page is built ONCE, from the constants below, and the handlers only return those finished strings. Nothing from the
 * request (the token, the address, the workspace) can reach the HTML, so there is nothing to escape and nothing to echo.
 */
function render(title: Copy, body: Copy, form: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title.vi} / ${title.en}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1a1a1a}button{font:inherit;padding:.6rem 1.1rem;border:0;border-radius:.4rem;background:#1a1a1a;color:#fff;cursor:pointer}</style></head><body><h1>${title.vi} / <span lang="en">${title.en}</span></h1><p>${body.vi}<br><span lang="en">${body.en}</span></p>${form}</body></html>`;
}

const PAGES = Object.freeze({
  invalid: render(
    { vi: "Liên kết không hợp lệ", en: "Invalid link" },
    { vi: "Liên kết này không hợp lệ hoặc đã bị hỏng.", en: "This link is not valid." },
    "",
  ),
  confirm: render(
    { vi: "Hủy đăng ký nhận email?", en: "Unsubscribe?" },
    { vi: "Nhấn nút bên dưới để không nhận email từ người gửi này nữa.", en: "Press the button to stop receiving emails from this sender." },
    `<form method="post" action=""><button type="submit">Hủy đăng ký / <span lang="en">Unsubscribe</span></button></form>`,
  ),
  done: render(
    { vi: "Bạn đã hủy đăng ký", en: "You are unsubscribed" },
    { vi: "Chúng tôi sẽ không gửi email đến địa chỉ này nữa.", en: "We will not email this address again." },
    "",
  ),
});

/**
 * Public (no login). The link in every email opens a confirmation page: opening it changes nothing, because mail
 * scanners and previews open links. Only the POST (the button, or a mail client's one-click unsubscribe) records the opt-out.
 */
@Controller("unsubscribe")
export class UnsubscribeController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private parse(token: string) { return verifyUnsubscribe(token, this.config.getOrThrow<string>("JWT_SECRET")); }

  @Get(":token")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirm(@Param("token") token: string) {
    return this.parse(token) ? PAGES.confirm : PAGES.invalid;
  }

  @Post(":token")
  @HttpCode(200)
  @Header("Content-Type", "text/html; charset=utf-8")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribe(@Param("token") token: string) {
    const t = this.parse(token);
    if (!t) return PAGES.invalid;
    await this.prisma.emailOptOut.upsert({
      where: { workspaceId_email: { workspaceId: t.workspaceId, email: t.email } },
      create: { workspaceId: t.workspaceId, email: t.email, reason: "unsubscribe link" },
      update: {},
    });
    // anything still waiting for this address is withdrawn
    await this.prisma.outboundMessage.updateMany({ where: { workspaceId: t.workspaceId, channel: "email", toEmail: t.email, status: { in: ["draft", "approved"] } }, data: { status: "cancelled", error: "Recipient opted out" } });
    return PAGES.done;
  }
}
