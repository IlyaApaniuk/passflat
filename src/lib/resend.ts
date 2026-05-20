import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Passflat <noreply@passflat.eu>';

const TEAM_EMAIL = process.env.CONTACT_EMAIL || 'contact@passflat.eu';

interface ContactFormEmailParams {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendContactFormEmail(params: ContactFormEmailParams) {
  const { name, email, subject, message } = params;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TEAM_EMAIL,
      replyTo: email,
      subject: `[Contact] ${subject}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#18181b;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#18181b;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Passflat — Contact Form</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;">${subject}</h2>
      <p style="margin:0 0 24px;color:#71717a;font-size:14px;">New message from the contact form</p>

      <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:14px;"><strong>From:</strong> ${name}</p>
        <p style="margin:0 0 12px;font-size:14px;"><strong>Email:</strong> <a href="mailto:${email}" style="color:#2563eb;">${email}</a></p>
        <p style="margin:0;font-size:14px;"><strong>Message:</strong></p>
        <p style="margin:8px 0 0;font-size:14px;color:#3f3f46;white-space:pre-wrap;">${message}</p>
      </div>
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
      <p style="margin:0;font-size:12px;color:#a1a1aa;">Reply directly to this email to respond to ${name}.</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
    });

    if (error) {
      console.error('[resend] Failed to send contact email:', error);
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[resend] Exception sending contact email:', err);
    return { success: false, error: err };
  }
}

interface NewInquiryEmailParams {
  to: string;
  listingTitle: string;
  responderName: string;
  responderEmail: string;
  responderPhone?: string;
  message: string;
  listingUrl: string;
  dashboardUrl: string;
}

export async function sendNewInquiryEmail(params: NewInquiryEmailParams) {
  const {
    to,
    listingTitle,
    responderName,
    responderEmail,
    responderPhone,
    message,
    listingUrl,
    dashboardUrl,
  } = params;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `New inquiry for "${listingTitle}"`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#18181b;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#18181b;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Passflat</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;">New inquiry for your listing</h2>
      <p style="margin:0 0 24px;color:#71717a;font-size:14px;">Someone is interested in <strong>${listingTitle}</strong></p>

      <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:14px;"><strong>From:</strong> ${responderName}</p>
        <p style="margin:0 0 12px;font-size:14px;"><strong>Email:</strong> <a href="mailto:${responderEmail}" style="color:#2563eb;">${responderEmail}</a></p>
        ${responderPhone ? `<p style="margin:0 0 12px;font-size:14px;"><strong>Phone:</strong> <a href="tel:${responderPhone}" style="color:#2563eb;">${responderPhone}</a></p>` : ''}
        <p style="margin:0;font-size:14px;"><strong>Message:</strong></p>
        <p style="margin:8px 0 0;font-size:14px;color:#3f3f46;white-space:pre-wrap;">${message}</p>
      </div>

      <div style="text-align:center;">
        <a href="${listingUrl}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;margin-right:8px;">View Listing</a>
        <a href="${dashboardUrl}" style="display:inline-block;background:#f4f4f5;color:#18181b;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">Go to Dashboard</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
      <p style="margin:0;font-size:12px;color:#a1a1aa;">You received this email because you have an active listing on Passflat.</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
    });

    if (error) {
      console.error('[resend] Failed to send inquiry email:', error);
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[resend] Exception sending email:', err);
    return { success: false, error: err };
  }
}
