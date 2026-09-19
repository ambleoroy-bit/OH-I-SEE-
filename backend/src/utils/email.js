const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify SMTP Connection on Startup
async function verifySmtpConnection() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('📧 SMTP credentials missing. Running in DEV MODE EMAIL SIMULATION.');
    return;
  }
  
  try {
    await transporter.verify();
    console.log('✅ SMTP Connected Successfully');
  } catch (error) {
    console.error('❌ SMTP Connection Failed:', error.message);
  }
}

async function sendResetEmail(to, resetToken) {
  const isDevMode = !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.NODE_ENV === 'development';
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}`;

  if (isDevMode) {
    console.log('\n====================================');
    console.log('📧 DEV MODE EMAIL SIMULATION');
    console.log('Password Reset Link');
    console.log(resetUrl);
    console.log('====================================\n');
    return true; // Simulate success
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"OH I SEE" <noreply@ohisee.in>',
    to: to,
    subject: 'Reset Your OH I SEE Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E0E0E0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${baseUrl}/images/logo.png" alt="OH I SEE Logo" style="max-width: 100px;">
        </div>
        <h2 style="color: #121212;">Password Reset Request</h2>
        <p style="color: #333;">Hello,</p>
        <p style="color: #333;">We received a request to reset your password for your OH I SEE account.</p>
        <p style="color: #333;">Click the button below to create a new password.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #FFD100; color: #121212; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">Alternatively, copy and paste this link into your browser:</p>
        <p style="color: #3366cc; font-size: 12px; word-break: break-all;">${resetUrl}</p>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">This link expires in 15 minutes.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this reset, simply ignore this email. Your password will remain unchanged.</p>
        <hr style="border: 0; border-top: 1px solid #E0E0E0; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">Regards,<br>OH I SEE Team</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Email Delivery Failed:', error.message);
    throw new Error('Unable to send password reset email. Please try again later.');
  }
}

module.exports = { sendResetEmail, verifySmtpConnection };
