import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import officecrypto from 'officecrypto-tool';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Decrypt Excel route using officecrypto-tool natively
  app.post('/api/decrypt-excel', async (req, res) => {
    try {
      const { fileBase64, password } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: 'fileBase64 is required' });
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      let isEncrypted = false;
      try {
        isEncrypted = officecrypto.isEncrypted(buffer);
      } catch {
        isEncrypted = false;
      }

      if (!isEncrypted) {
        return res.json({ decryptedBase64: fileBase64, isEncrypted: false, success: true });
      }

      if (!password) {
        return res.status(422).json({ error: 'password_required', isEncrypted: true });
      }

      try {
        const decrypted = await officecrypto.decrypt(buffer, { password: String(password).trim() });
        const decryptedBuf = Buffer.isBuffer(decrypted) ? decrypted : Buffer.from(decrypted);
        return res.json({
          decryptedBase64: decryptedBuf.toString('base64'),
          isEncrypted: true,
          success: true,
        });
      } catch (decErr: any) {
        const msg = String(decErr?.message || decErr || '');
        return res.status(401).json({
          error: 'invalid_password',
          message: '비밀번호가 일치하지 않습니다. 비밀번호를 다시 확인해 주세요.',
          detail: msg,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        error: 'decrypt_failed',
        message: err?.message || '엑셀 파일 복호화 중 오류가 발생했습니다.',
      });
    }
  });

  // Check encryption status
  app.post('/api/check-excel-encryption', (req, res) => {
    try {
      const { fileBase64 } = req.body;
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });
      const buffer = Buffer.from(fileBase64, 'base64');
      const isEncrypted = officecrypto.isEncrypted(buffer);
      return res.json({ isEncrypted });
    } catch {
      return res.json({ isEncrypted: false });
    }
  });

  // Encrypt Excel for samples/testing
  app.post('/api/encrypt-excel', (req, res) => {
    try {
      const { fileBase64, password } = req.body;
      if (!fileBase64 || !password) {
        return res.status(400).json({ error: 'fileBase64 and password are required' });
      }
      const buffer = Buffer.from(fileBase64, 'base64');
      const encrypted = officecrypto.encrypt(buffer, { password: String(password).trim() });
      const encBuf = Buffer.isBuffer(encrypted) ? encrypted : Buffer.from(encrypted);
      return res.json({
        encryptedBase64: encBuf.toString('base64'),
        success: true,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'encrypt_failed',
        message: err?.message || '엑셀 파일 암호화 중 오류가 발생했습니다.',
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
