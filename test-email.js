const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'marifnurrizki@gmail.com',
        pass: 'hjxicghemjvvndxh'
    }
});

transporter.verify(function(error, success) {
    if (error) {
        console.log("Koneksi gagal:", error);
    } else {
        console.log("Server is ready to take our messages");
    }
});
