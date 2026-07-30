# Gunakan node image versi LTS (lightweight alpine)
FROM node:20-alpine

# Set working directory di dalam container
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install seluruh dependencies proyek
RUN npm ci

# Copy seluruh source code proyek ke dalam container
COPY . .

# Lakukan validasi build (Typecheck & Production Build)
RUN npm run validate

# Port default yang diwajibkan oleh Hugging Face Spaces adalah 7860
ENV PORT=7860
ENV NODE_ENV=production

# Expose port agar bisa diakses luar
EXPOSE 7860

# Jalankan server production
CMD ["npm", "start"]
