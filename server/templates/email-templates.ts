/**
 * Email templates for notifications
 * Each template returns HTML and plain text versions
 */

export interface EmailTemplate {
  html: string;
  text: string;
}

export interface ClubBranding {
  name: string;
  primaryColor?: string;
  logoUrl?: string;
}

// Base template wrapper
function wrapHtml(content: string, branding?: ClubBranding): string {
  const primaryColor = branding?.primaryColor || '#2563eb';
  const clubName = branding?.name || 'Tennis Club';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${clubName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: ${primaryColor}; margin: 0; font-size: 24px; }
    .content { margin-bottom: 30px; }
    .button { display: inline-block; background: ${primaryColor}; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
    .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
    .detail { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .detail-row { display: flex; margin-bottom: 8px; }
    .detail-label { font-weight: 600; min-width: 120px; }
    h2 { color: #333; margin-top: 0; }
    a { color: ${primaryColor}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        ${branding?.logoUrl ? `<img src="${branding.logoUrl}" alt="${clubName}" style="max-height: 60px; margin-bottom: 10px;">` : ''}
        <h1>${clubName}</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>You received this email because you are registered with ${clubName}.</p>
        <p><a href="{{unsubscribeUrl}}">Manage notification preferences</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Match Scheduled
export interface MatchScheduledData {
  playerName: string;
  opponentName: string;
  competitionName: string;
  divisionName: string;
  scheduledTime: string;
  court: string;
  matchUrl: string;
  branding?: ClubBranding;
}

export function matchScheduledTemplate(data: MatchScheduledData): EmailTemplate {
  const html = wrapHtml(
    `
    <h2>Match Scheduled</h2>
    <p>Hi ${data.playerName},</p>
    <p>Your match has been scheduled in the <strong>${data.competitionName}</strong> (${data.divisionName}).</p>

    <div class="detail">
      <div class="detail-row"><span class="detail-label">Opponent:</span> ${data.opponentName}</div>
      <div class="detail-row"><span class="detail-label">Date & Time:</span> ${data.scheduledTime}</div>
      <div class="detail-row"><span class="detail-label">Court:</span> ${data.court}</div>
    </div>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.matchUrl}" class="button">View Match Details</a>
    </p>

    <p>Good luck!</p>
    `,
    data.branding
  );

  const text = `
Match Scheduled

Hi ${data.playerName},

Your match has been scheduled in the ${data.competitionName} (${data.divisionName}).

Opponent: ${data.opponentName}
Date & Time: ${data.scheduledTime}
Court: ${data.court}

View match details: ${data.matchUrl}

Good luck!
`.trim();

  return { html, text };
}

// Match Reminder
export interface MatchReminderData {
  playerName: string;
  opponentName: string;
  competitionName: string;
  divisionName: string;
  scheduledTime: string;
  court: string;
  matchUrl: string;
  hoursUntilMatch: number;
  branding?: ClubBranding;
}

export function matchReminderTemplate(data: MatchReminderData): EmailTemplate {
  const timeText =
    data.hoursUntilMatch === 1 ? '1 hour' : data.hoursUntilMatch === 24 ? 'tomorrow' : `${data.hoursUntilMatch} hours`;

  const html = wrapHtml(
    `
    <h2>Match Reminder</h2>
    <p>Hi ${data.playerName},</p>
    <p>This is a reminder that your match is coming up <strong>${timeText}</strong>!</p>

    <div class="detail">
      <div class="detail-row"><span class="detail-label">Competition:</span> ${data.competitionName} - ${data.divisionName}</div>
      <div class="detail-row"><span class="detail-label">Opponent:</span> ${data.opponentName}</div>
      <div class="detail-row"><span class="detail-label">Date & Time:</span> ${data.scheduledTime}</div>
      <div class="detail-row"><span class="detail-label">Court:</span> ${data.court}</div>
    </div>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.matchUrl}" class="button">View Match Details</a>
    </p>
    `,
    data.branding
  );

  const text = `
Match Reminder

Hi ${data.playerName},

This is a reminder that your match is coming up ${timeText}!

Competition: ${data.competitionName} - ${data.divisionName}
Opponent: ${data.opponentName}
Date & Time: ${data.scheduledTime}
Court: ${data.court}

View match details: ${data.matchUrl}
`.trim();

  return { html, text };
}

// Registration Approved
export interface RegistrationApprovedData {
  playerName: string;
  competitionName: string;
  divisionName: string;
  competitionUrl: string;
  branding?: ClubBranding;
}

export function registrationApprovedTemplate(data: RegistrationApprovedData): EmailTemplate {
  const html = wrapHtml(
    `
    <h2>Registration Approved</h2>
    <p>Hi ${data.playerName},</p>
    <p>Great news! Your registration for <strong>${data.competitionName}</strong> (${data.divisionName}) has been approved.</p>

    <p>You're all set to compete. Make sure to check the draw once it's published for your match schedule.</p>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.competitionUrl}" class="button">View Competition</a>
    </p>
    `,
    data.branding
  );

  const text = `
Registration Approved

Hi ${data.playerName},

Great news! Your registration for ${data.competitionName} (${data.divisionName}) has been approved.

You're all set to compete. Make sure to check the draw once it's published for your match schedule.

View competition: ${data.competitionUrl}
`.trim();

  return { html, text };
}

// Registration Rejected
export interface RegistrationRejectedData {
  playerName: string;
  competitionName: string;
  divisionName: string;
  reason?: string;
  contactEmail?: string;
  branding?: ClubBranding;
}

export function registrationRejectedTemplate(data: RegistrationRejectedData): EmailTemplate {
  const reasonText = data.reason
    ? `<p><strong>Reason:</strong> ${data.reason}</p>`
    : '<p>No specific reason was provided.</p>';

  const reasonTextPlain = data.reason ? `Reason: ${data.reason}` : 'No specific reason was provided.';

  const contactText = data.contactEmail
    ? `<p>If you have questions, please contact us at <a href="mailto:${data.contactEmail}">${data.contactEmail}</a>.</p>`
    : '';

  const contactTextPlain = data.contactEmail ? `If you have questions, please contact us at ${data.contactEmail}.` : '';

  const html = wrapHtml(
    `
    <h2>Registration Not Approved</h2>
    <p>Hi ${data.playerName},</p>
    <p>Unfortunately, your registration for <strong>${data.competitionName}</strong> (${data.divisionName}) was not approved.</p>

    ${reasonText}
    ${contactText}
    `,
    data.branding
  );

  const text = `
Registration Not Approved

Hi ${data.playerName},

Unfortunately, your registration for ${data.competitionName} (${data.divisionName}) was not approved.

${reasonTextPlain}
${contactTextPlain}
`.trim();

  return { html, text };
}

// Partner Request Received
export interface PartnerRequestReceivedData {
  playerName: string;
  requesterName: string;
  competitionName: string;
  divisionName: string;
  message?: string;
  respondUrl: string;
  expiresAt: string;
  branding?: ClubBranding;
}

export function partnerRequestReceivedTemplate(data: PartnerRequestReceivedData): EmailTemplate {
  const messageText = data.message ? `<p><strong>Message:</strong> "${data.message}"</p>` : '';

  const messageTextPlain = data.message ? `Message: "${data.message}"` : '';

  const html = wrapHtml(
    `
    <h2>Partner Request</h2>
    <p>Hi ${data.playerName},</p>
    <p><strong>${data.requesterName}</strong> would like to partner with you for <strong>${data.competitionName}</strong> (${data.divisionName}).</p>

    ${messageText}

    <p>This request expires on ${data.expiresAt}.</p>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.respondUrl}" class="button">Respond to Request</a>
    </p>
    `,
    data.branding
  );

  const text = `
Partner Request

Hi ${data.playerName},

${data.requesterName} would like to partner with you for ${data.competitionName} (${data.divisionName}).

${messageTextPlain}

This request expires on ${data.expiresAt}.

Respond to request: ${data.respondUrl}
`.trim();

  return { html, text };
}

// Partner Request Accepted
export interface PartnerRequestResponseData {
  playerName: string;
  partnerName: string;
  competitionName: string;
  divisionName: string;
  competitionUrl: string;
  accepted: boolean;
  branding?: ClubBranding;
}

export function partnerRequestResponseTemplate(data: PartnerRequestResponseData): EmailTemplate {
  if (data.accepted) {
    const html = wrapHtml(
      `
      <h2>Partner Request Accepted</h2>
      <p>Hi ${data.playerName},</p>
      <p>Great news! <strong>${data.partnerName}</strong> has accepted your partner request for <strong>${data.competitionName}</strong> (${data.divisionName}).</p>

      <p>Your doubles entry has been created. You're all set to compete!</p>

      <p style="text-align: center; margin-top: 25px;">
        <a href="${data.competitionUrl}" class="button">View Competition</a>
      </p>
      `,
      data.branding
    );

    const text = `
Partner Request Accepted

Hi ${data.playerName},

Great news! ${data.partnerName} has accepted your partner request for ${data.competitionName} (${data.divisionName}).

Your doubles entry has been created. You're all set to compete!

View competition: ${data.competitionUrl}
`.trim();

    return { html, text };
  } else {
    const html = wrapHtml(
      `
      <h2>Partner Request Declined</h2>
      <p>Hi ${data.playerName},</p>
      <p><strong>${data.partnerName}</strong> has declined your partner request for <strong>${data.competitionName}</strong> (${data.divisionName}).</p>

      <p>You can send a request to another player or wait for someone to invite you.</p>

      <p style="text-align: center; margin-top: 25px;">
        <a href="${data.competitionUrl}" class="button">View Competition</a>
      </p>
      `,
      data.branding
    );

    const text = `
Partner Request Declined

Hi ${data.playerName},

${data.partnerName} has declined your partner request for ${data.competitionName} (${data.divisionName}).

You can send a request to another player or wait for someone to invite you.

View competition: ${data.competitionUrl}
`.trim();

    return { html, text };
  }
}

// Draw Published
export interface DrawPublishedData {
  playerName: string;
  competitionName: string;
  divisionName: string;
  drawUrl: string;
  branding?: ClubBranding;
}

export function drawPublishedTemplate(data: DrawPublishedData): EmailTemplate {
  const html = wrapHtml(
    `
    <h2>Draw Published</h2>
    <p>Hi ${data.playerName},</p>
    <p>The draw for <strong>${data.competitionName}</strong> (${data.divisionName}) has been published!</p>

    <p>Check out the bracket to see your matches and opponents.</p>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.drawUrl}" class="button">View Draw</a>
    </p>
    `,
    data.branding
  );

  const text = `
Draw Published

Hi ${data.playerName},

The draw for ${data.competitionName} (${data.divisionName}) has been published!

Check out the bracket to see your matches and opponents.

View draw: ${data.drawUrl}
`.trim();

  return { html, text };
}

// Competition Update
export interface CompetitionUpdateData {
  playerName: string;
  competitionName: string;
  updateType: 'published' | 'in_progress' | 'completed' | 'cancelled';
  competitionUrl: string;
  branding?: ClubBranding;
}

export function competitionUpdateTemplate(data: CompetitionUpdateData): EmailTemplate {
  const messages: Record<string, { title: string; message: string }> = {
    published: {
      title: 'Competition Published',
      message: 'The competition is now open for viewing. Check out the divisions and register if you haven\'t already.',
    },
    in_progress: {
      title: 'Competition Started',
      message: 'The competition has officially started. Good luck to all participants!',
    },
    completed: {
      title: 'Competition Completed',
      message: 'The competition has concluded. Thank you for participating!',
    },
    cancelled: {
      title: 'Competition Cancelled',
      message:
        'Unfortunately, the competition has been cancelled. We apologize for any inconvenience.',
    },
  };

  const { title, message } = messages[data.updateType] || messages.published;

  const html = wrapHtml(
    `
    <h2>${title}</h2>
    <p>Hi ${data.playerName},</p>
    <p>Update for <strong>${data.competitionName}</strong>:</p>

    <p>${message}</p>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.competitionUrl}" class="button">View Competition</a>
    </p>
    `,
    data.branding
  );

  const text = `
${title}

Hi ${data.playerName},

Update for ${data.competitionName}:

${message}

View competition: ${data.competitionUrl}
`.trim();

  return { html, text };
}

// Announcement
export interface AnnouncementData {
  playerName: string;
  competitionName: string;
  subject: string;
  message: string;
  competitionUrl: string;
  branding?: ClubBranding;
}

export function announcementTemplate(data: AnnouncementData): EmailTemplate {
  const html = wrapHtml(
    `
    <h2>${data.subject}</h2>
    <p>Hi ${data.playerName},</p>
    <p>Message from the organisers of <strong>${data.competitionName}</strong>:</p>

    <div class="detail">
      <p style="margin: 0; white-space: pre-wrap;">${data.message}</p>
    </div>

    <p style="text-align: center; margin-top: 25px;">
      <a href="${data.competitionUrl}" class="button">View Competition</a>
    </p>
    `,
    data.branding
  );

  const text = `
${data.subject}

Hi ${data.playerName},

Message from the organisers of ${data.competitionName}:

${data.message}

View competition: ${data.competitionUrl}
`.trim();

  return { html, text };
}
