// api/convert.js

import { formidable } from 'formidable';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

export const config = {
    api: {
        bodyParser: false,
    },
};

const getMimeType = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    switch (extension) {
        case 'pdf': return 'application/pdf';
        case 'doc': return 'application/msword';
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'ppt': return 'application/vnd.ms-powerpoint';
        case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        case 'xls': return 'application/vnd.ms-excel';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        default: return 'application/octet-stream';
    }
};

export default async function handler(req, res) {
    console.log("Bắt đầu xử lý yêu cầu /api/convert");

    if (req.method !== 'POST') {
        console.log("Lỗi: Phương thức không hợp lệ -", req.method);
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const iLovePdfApiKey = process.env.ILOVEPDF_API_KEY;
    if (!iLovePdfApiKey) {
        console.error("CRITICAL ERROR: Biến môi trường ILOVEPDF_API_KEY không tồn tại!");
        return res.status(500).json({ message: 'API key không được cấu hình trên server.' });
    }
    console.log("Bước 1: Đã tìm thấy API key.");

    try {
        console.log("Bước 2: Bắt đầu xác thực với iLovePDF...");
        const authResponse = await fetch('https://api.ilovepdf.com/v1/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: iLovePdfApiKey }),
        });
        if (!authResponse.ok) throw new Error(`Không thể xác thực với iLovePDF. Status: ${authResponse.status}`);
        const authData = await authResponse.json();
        const bearerToken = authData.token;
        console.log("Bước 2: Xác thực thành công.");

        console.log("Bước 3: Bắt đầu phân tích file tải lên...");
        const form = formidable({});
        const [fields, files] = await form.parse(req);
        
        const conversionType = fields.conversionType[0];
        const uploadedFile = files.file[0];
        console.log(`Bước 3: Phân tích file thành công. Loại chuyển đổi: ${conversionType}, Tên file: ${uploadedFile.originalFilename}`);

        console.log("Bước 4: Bắt đầu tác vụ mới trên iLovePDF...");
        const startResponse = await fetch(`https://api.ilovepdf.com/v1/start/${conversionType}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (!startResponse.ok) {
            const errorBody = await startResponse.text();
            throw new Error(`Không thể bắt đầu tác vụ. Status: ${startResponse.status}. Phản hồi: ${errorBody}`);
        }
        const startData = await startResponse.json();
        const { server, task } = startData;
        console.log(`Bước 4: Bắt đầu tác vụ thành công. Task ID: ${task}`);

        console.log("Bước 5: Bắt đầu tải file lên server của iLovePDF...");
        const uploadFormData = new FormData();
        uploadFormData.append('task', task);
        uploadFormData.append('file', fs.createReadStream(uploadedFile.filepath), uploadedFile.originalFilename);

        const uploadResponse = await fetch(`https://${server}/v1/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearerToken}` },
            body: uploadFormData,
        });
        if (!uploadResponse.ok) throw new Error(`Tải file lên thất bại. Status: ${uploadResponse.status}`);
        console.log("Bước 5: Tải file lên thành công.");

        console.log("Bước 6: Bắt đầu xử lý file...");
        const processResponse = await fetch(`https://${server}/v1/process`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: task, tool: conversionType }),
        });
        if (!processResponse.ok) throw new Error(`Xử lý file thất bại. Status: ${processResponse.status}`);
        const processData = await processResponse.json();
        const outputFileName = processData.download_filename;
        console.log(`Bước 6: Xử lý file thành công. Tên file đầu ra: ${outputFileName}`);

        console.log("Bước 7: Bắt đầu tải file kết quả về...");
        const downloadResponse = await fetch(`https://${server}/v1/download/${task}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (!downloadResponse.ok) throw new Error(`Tải file kết quả thất bại. Status: ${downloadResponse.status}`);
        console.log("Bước 7: Tải file kết quả thành công.");
        
        const fileArrayBuffer = await downloadResponse.arrayBuffer();
        const fileBuffer = Buffer.from(fileArrayBuffer);

        const mimeType = getMimeType(outputFileName);
        
        console.log(`Bước 8: Chuẩn bị gửi file về cho người dùng. MimeType: ${mimeType}, Tên file: ${outputFileName}`);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        
        res.status(200).send(fileBuffer);
        console.log("Bước 9: Đã gửi file thành công!");

    } catch (error) {
        console.error("--- LỖI XẢY RA ---");
        console.error(error);
        res.status(500).json({ message: error.message || 'Đã có lỗi xảy ra.' });
    }
}
