import { Token } from '../token.js';

export const BACKEND_TOKEN = new Token<typeof backendValues>('BACKEND');

export const backendValues = {
  url: 'https://api.example.com',
  timeout: 1000,
};
