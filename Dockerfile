#Imagen base oficial de Bun
FROM oven/bun:latest

#Crear directorio de la app
WORKDIR /app

#Copiar dependencias 
COPY bun.lock package.json ./

#Instalar dependencias
RUN bun install

#Copiar el resto del código
COPY . .

#Exponer puerto del microservicio
EXPOSE 3000

#Comando de arranque
CMD ["bun", "run", "src/index.ts"]