const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs').promises;
const pdf = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf' || 
            file.mimetype === 'application/msword' || 
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and Word documents are allowed!'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Document Generation Endpoint
app.post('/generate-document', async (req, res) => {
    try {
        const { documentType, details } = req.body;
        
        if (!documentType || !details) {
            return res.status(400).json({ 
                error: 'Document type and details are required' 
            });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Generate a professional ${documentType} following Indian legal standards.
            
            Details provided:
            ${details}
            
            Requirements:
            1. Follow Indian legal format
            2. Include all necessary clauses
            3. Use formal legal language
            4. Ensure compliance with Indian laws
            5. Include jurisdiction under Indian courts
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ document: text });

    } catch (error) {
        console.error('Document generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate document',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Legal Chatbot Endpoint
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ 
                error: 'Message is required' 
            });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            You are an expert Indian legal assistant. Provide a clear and helpful response to this question: "${message}"

            Guidelines:
            1. Use simple, clear language
            2. Reference specific Indian laws and regulations
            3. Include relevant legal precedents if applicable
            4. Suggest consulting a lawyer for complex matters
            5. Structure the response clearly
            6. Keep it concise but informative

            Important: Always include a disclaimer that this is general information and not legal advice.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ 
            response: text,
            status: 'success'
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to process your question. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// File Upload Endpoint
app.post('/upload-training-files', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const processedFiles = [];

        for (const file of req.files) {
            try {
                let content = '';
                if (file.mimetype === 'application/pdf') {
                    const dataBuffer = await fs.readFile(file.path);
                    const pdfData = await pdf(dataBuffer);
                    content = pdfData.text;
                }

                processedFiles.push({
                    filename: file.originalname,
                    content: content,
                    size: file.size
                });

                await fs.unlink(file.path);

            } catch (fileError) {
                console.error(`Error processing file ${file.originalname}:`, fileError);
                processedFiles.push({
                    filename: file.originalname,
                    error: 'Failed to process file'
                });
            }
        }

        res.json({
            success: true,
            message: 'Files processed successfully',
            processedFiles: processedFiles
        });

    } catch (error) {
        console.error('Error handling file upload:', error);
        res.status(500).json({
            error: 'Failed to process files',
            details: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Gemini API Key status:', process.env.GEMINI_API_KEY ? 'Present' : 'Missing');
});

console.log('Current directory:', __dirname);
console.log('Environment variables:', {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Present' : 'Missing',
    PORT: process.env.PORT
}); 