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
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const iLovePdfApiKey = process.env.ILOVEPDF_API_KEY;
    if (!iLovePdfApiKey) {
        console.error("CRITICAL ERROR: Biến môi trường ILOVEPDF_API_KEY không tồn tại!");
        return res.status(500).json({ message: 'API key không được cấu hình trên server.' });
    }

    try {
        const authResponse = await fetch('https://api.ilovepdf.com/v1/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: iLovePdfApiKey }),
        });
        if (!authResponse.ok) throw new Error(`Không thể xác thực với iLovePDF. Status: ${authResponse.status}`);
        const authData = await authResponse.json();
        const bearerToken = authData.token;

        const form = formidable({});
        const [fields, files] = await form.parse(req);
        
        const conversionType = fields.conversionType[0];
        const uploadedFile = files.file[0];

        const startResponse = await fetch(`https://api.ilovepdf.com/v1/start/${conversionType}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (!startResponse.ok) {
            const errorBody = await startResponse.text();
            throw new Error(`Không thể bắt đầu tác vụ. Status: ${startResponse.status}. Phản hồi: ${errorBody}`);
        }
        const startData = await startResponse.json();
        const { server, task } = startData;

        const uploadFormData = new FormData();
        uploadFormData.append('task', task);
        uploadFormData.append('file', fs.createReadStream(uploadedFile.filepath), uploadedFile.originalFilename);

        const uploadResponse = await fetch(`https://${server}/v1/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearerToken}` },
            body: uploadFormData,
        });
        if (!uploadResponse.ok) throw new Error(`Tải file lên thất bại. Status: ${uploadResponse.status}`);

        const processResponse = await fetch(`https://${server}/v1/process`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: task, tool: conversionType }),
        });
        if (!processResponse.ok) throw new Error(`Xử lý file thất bại. Status: ${processResponse.status}`);
        const processData = await processResponse.json();
        const outputFileName = processData.download_filename;

        const downloadResponse = await fetch(`https://${server}/v1/download/${task}`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (!downloadResponse.ok) throw new Error(`Tải file kết quả thất bại. Status: ${downloadResponse.status}`);
        
        const fileArrayBuffer = await downloadResponse.arrayBuffer();
        const fileBuffer = Buffer.from(fileArrayBuffer);

        const mimeType = getMimeType(outputFileName);
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        
        res.status(200).send(fileBuffer);

    } catch (error) {
        console.error("--- LỖI XẢY RA ---");
        console.error(error);
        res.status(500).json({ message: error.message || 'Đã có lỗi xảy ra.' });
    }
}
