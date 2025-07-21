// api/convert.js

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

// Hàm hỗ trợ để xác định loại file từ tên
const getMimeType = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    switch (extension) {
        case 'pdf': return 'application/pdf';
        case 'doc': return 'application/msword';
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'ppt': return 'application/vnd.ms-powerpoint';
        case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        case 'xls': return 'application/vnd.ms-excel';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        default: return 'application/octet-stream'; // Loại mặc định cho các file khác
    }
};


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const iLovePdfApiKey = process.env.ILOVEPDF_API_KEY;
    if (!iLovePdfApiKey) {
        return res.status(500).json({ message: 'API key không được cấu hình trên server.' });
    }

    try {
        // 1. Lấy token để xác thực
        const authResponse = await fetch('https://api.ilovepdf.com/v1/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: iLovePdfApiKey }),
        });
        if (!authResponse.ok) throw new Error('Không thể xác thực với iLovePDF.');
        const authData = await authResponse.json();
        const bearerToken = authData.token;

        // 2. Phân tích file và dữ liệu người dùng gửi lên
        const form = formidable({});
        const [fields, files] = await form.parse(req);
        
        const conversionType = fields.conversionType[0];
        const uploadedFile = files.file[0];

        // 3. Bắt đầu tác vụ mới
        const startResponse = await fetch(`https://api.ilovepdf.com/v1/start/${conversionType}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (!startResponse.ok) throw new Error('Không thể bắt đầu tác vụ trên iLovePDF.');
        const startData = await startResponse.json();
        const { server, task } = startData;

        // 4. Tải file lên server của iLovePDF
        const uploadFormData = new FormData();
        uploadFormData.append('task', task);
        uploadFormData.append('file', fs.createReadStream(uploadedFile.filepath), uploadedFile.originalFilename);

        const uploadResponse = await fetch(`https://${server}/v1/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearerToken}` },
            body: uploadFormData,
        });
        if (!uploadResponse.ok) throw new Error('Tải file lên iLovePDF thất bại.');

        // 5. Xử lý file
        const processResponse = await fetch(`https://${server}/v1/process`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ task: task, tool: conversionType }),
        });
        if (!processResponse.ok) throw new Error('Xử lý file trên iLovePDF thất bại.');
        const processData = await processResponse.json();
        const outputFileName = processData.download_filename;

        // 6. Tải file kết quả về
        const downloadResponse = await fetch(`https://${server}/v1/download/${task}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });

        if (!downloadResponse.ok) {
            throw new Error('Không thể tải file đã chuyển đổi từ iLovePDF.');
        }

        const fileArrayBuffer = await downloadResponse.arrayBuffer();
        const fileBuffer = Buffer.from(fileArrayBuffer);

        // *** SỬA LỖI: Đặt Content-Type một cách tường minh ***
        const mimeType = getMimeType(outputFileName);
        
        // Thiết lập header để trình duyệt hiểu đây là file tải về
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        
        // Gửi toàn bộ file về cho người dùng
        res.status(200).send(fileBuffer);

    } catch (error) {
        console.error('Lỗi trong quá trình chuyển đổi:', error);
        res.status(500).json({ message: error.message || 'Đã có lỗi xảy ra.' });
    }
}
