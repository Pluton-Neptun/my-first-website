// services/emailService.js
import nodemailer from 'nodemailer';

// Настраиваем "почтальона"
const transporter = nodemailer.createTransport({
    host: 'smtp.mail.ru', // Если Gmail, то 'smtp.gmail.com', если Яндекс, то 'smtp.yandex.ru'
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS
    }
});

export async function sendVerificationEmail(userEmail, token) {
    // Ссылка, по которой должен кликнуть пользователь
    // Если тестируешь на компьютере, поменяй mikky.kz на localhost:3000
    const verificationLink = `https://mikky.kz/verify/${token}`;

    const mailOptions = {
        from: `"Mikky.kz" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: 'Подтверждение регистрации на Mikky.kz 🚀',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4; border-radius: 10px;">
                <h2 style="color: #007BFF;">Добро пожаловать на Mikky.kz!</h2>
                <p>Остался всего один шаг. Пожалуйста, подтвердите вашу почту, чтобы активировать аккаунт.</p>
                <a href="${verificationLink}" style="display: inline-block; padding: 12px 25px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px;">
                    ✅ Подтвердить Email
                </a>
                <p style="margin-top: 20px; font-size: 12px; color: #777;">Если кнопка не работает, скопируйте эту ссылку в браузер:<br>${verificationLink}</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}