const nodemailer = require("nodemailer");

const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const sendProcessingCompleteEmail = async (email, jobId, downloadLinks) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Your Excel Processing Job #${jobId} is Complete`,
      html: `
        <h2>Excel Processing Complete</h2>
        <p>Your job #${jobId} has been processed successfully.</p>
        <p>You can download the results using the following links:</p>
        <ul>
          <li><a href="${downloadLinks.excel}">Download Excel Results</a></li>
          <li><a href="${downloadLinks.success}">Download Success Log</a></li>
          <li><a href="${downloadLinks.error}">Download Error Log</a></li>
        </ul>
        <p>Thank you for using our service!</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully for job ${jobId}`);
  } catch (error) {
    console.error(`Error sending email for job ${jobId}:`, error);
    throw error;
  }
};

module.exports = { sendProcessingCompleteEmail };
