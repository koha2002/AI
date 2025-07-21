// api/convert.js

// Cần cài đặt các thư viện: formidable, node-fetch, form-data
// Chạy lệnh: npm install formidable node-fetch form-data
import { formidable } from 'formidable';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

// Tắt bodyParser mặc định của Vercel để formidable có thể hoạt động
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Lấy API key từ biến môi trường trên Vercel (An toàn)
    const iLovePdfApiKey = process.env.ILOVEPDF_API_KEY;
    if (!iLovePdfApiKey) {
        return res.status(500).json({ message: 'API key không được cấu hình trên server.' });
    }

    try {
        // 1. Lấy token để xác thực với iLovePDF
        const authResponse = await fetch('https://api.ilovepdf.com/v1/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: iLovePdfApiKey }),
        });
        const authData = await authResponse.json();
        const bearerToken = authData.token;

        // 2. Phân tích file và dữ liệu người dùng gửi lên
        const form = formidable({});
        const [fields, files] = await form.parse(req);
        
        const conversionType = fields.conversionType[0];
        const uploadedFile = files.file[0];

        // 3. Bắt đầu một tác vụ mới trên iLovePDF
        const startResponse = await fetch(`https://api.ilovepdf.com/v1/start/${conversionType}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        const startData = await startResponse.json();
        const { server, task } = startData;

        // 4. Tải file lên server của iLovePDF
        const uploadFormData = new FormData();
        uploadFormData.append('task', task);
        uploadFormData.append('file', fs.createReadStream(uploadedFile.filepath), uploadedFile.originalFilename);

        await fetch(`https://${server}/v1/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearerToken}` },
            body: uploadFormData,
        });

        // 5. Xử lý file
        const processResponse = await fetch(`https://${server}/v1/process`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ task: task, tool: conversionType }),
        });
        const processData = await processResponse.json();
        const outputFileName = processData.download_filename;

        // 6. Tải file kết quả về và gửi cho người dùng
        const downloadResponse = await fetch(`https://${server}/v1/download/${task}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });

        if (!downloadResponse.ok) {
            throw new Error('Không thể tải file đã chuyển đổi.');
        }

        res.setHeader('Content-Type', downloadResponse.headers.get('content-type'));
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        
        // Chuyển luồng dữ liệu trực tiếp về cho trình duyệt
        downloadResponse.body.pipe(res);

    } catch (error) {
        console.error('Lỗi trong quá trình chuyển đổi:', error);
        res.status(500).json({ message: error.message || 'Đã có lỗi xảy ra.' });
    }
}
