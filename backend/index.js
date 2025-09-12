import app from './server.ts';

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
