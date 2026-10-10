import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emailDeliveryConfigured,
  sendEmail,
  sendOtpSms,
  sendWhatsApp,
  smsDeliveryConfigured,
  whatsappConfigured,
} from '@/lib/notify';

const gmail = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: gmail.createTransport } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const reply = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('Fast2SMS', () => {
  it('sends the code on the OTP route to the 10-digit number', async () => {
    vi.stubEnv('FAST2SMS_API_KEY', 'test-key');
    const fetch = reply({ return: true, request_id: 'r1' });
    vi.stubGlobal('fetch', fetch);

    expect(smsDeliveryConfigured()).toBe(true);
    expect(await sendOtpSms('9876543210', '482913')).toEqual({ ok: true });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://www.fast2sms.com/dev/bulkV2');
    expect(init.headers.authorization).toBe('test-key');
    expect(JSON.parse(init.body)).toEqual({ route: 'otp', variables_values: '482913', numbers: '9876543210' });
  });

  it('treats a 200 with return:false as a failed send', async () => {
    vi.stubEnv('FAST2SMS_API_KEY', 'test-key');
    vi.stubGlobal('fetch', reply({ return: false, status_code: 999, message: 'Insufficient balance' }));

    expect((await sendOtpSms('9876543210', '482913')).ok).toBe(false);
  });
});

describe('Gmail', () => {
  it('is preferred over Resend and sends with the app password, spaces removed', async () => {
    vi.stubEnv('GMAIL_USER', 'shop@example.com');
    vi.stubEnv('GMAIL_APP_PASSWORD', 'abcd efgh ijkl mnop');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'Avyora <onboarding@resend.dev>');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    gmail.createTransport.mockReturnValue({ sendMail: gmail.sendMail.mockResolvedValue({}) });

    expect(emailDeliveryConfigured()).toBe(true);
    expect(await sendEmail('buyer@example.com', 'Subject', 'Body')).toEqual({ ok: true });

    expect(fetch).not.toHaveBeenCalled();
    expect(gmail.createTransport.mock.calls[0]![0].auth).toEqual({
      user: 'shop@example.com',
      pass: 'abcdefghijklmnop',
    });
    expect(gmail.sendMail).toHaveBeenCalledWith({
      from: 'Avyora <shop@example.com>',
      to: 'buyer@example.com',
      subject: 'Subject',
      text: 'Body',
    });
  });

  it('reports a refused login as a failed send, not a crash', async () => {
    vi.stubEnv('GMAIL_USER', 'shop@example.com');
    vi.stubEnv('GMAIL_APP_PASSWORD', 'wrong');
    gmail.createTransport.mockReturnValue({
      sendMail: gmail.sendMail.mockRejectedValue(new Error('535 Invalid login')),
    });

    expect((await sendEmail('buyer@example.com', 'S', 'B')).ok).toBe(false);
  });
});

describe('Meta WhatsApp', () => {
  it('sends the order alert through the approved template', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', 'meta-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1390101614186851');
    vi.stubEnv('WHATSAPP_TO', '918369682814');
    vi.stubEnv('WHATSAPP_TEMPLATE', 'avyora_new_order');
    vi.stubEnv('WHATSAPP_TEMPLATE_LANG', 'en');
    const fetch = reply({ messages: [{ id: 'wamid.1' }] });
    vi.stubGlobal('fetch', fetch);

    expect(whatsappConfigured()).toBe(true);
    expect(await sendWhatsApp('AVY-1, Rs 678 (PAID)')).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v21.0/1390101614186851/messages');
    expect(init.headers.Authorization).toBe('Bearer meta-token');
    expect(JSON.parse(init.body)).toMatchObject({
      to: '918369682814',
      type: 'template',
      template: {
        name: 'avyora_new_order',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'AVY-1, Rs 678 (PAID)' }] }],
      },
    });
  });
});
