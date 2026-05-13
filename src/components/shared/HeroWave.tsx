"use client"

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

const HeroWave = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const speedRef = useRef(1.0);
  const timeRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width: number, height: number, imageData: ImageData, data: Uint8ClampedArray;
    const SCALE = 4;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      width = Math.floor(canvas.width / SCALE);
      height = Math.floor(canvas.height / SCALE);
      imageData = ctx.createImageData(width, height);
      data = imageData.data;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const SIN_TABLE = new Float32Array(1024);
    const COS_TABLE = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const angle = (i / 1024) * Math.PI * 2;
      SIN_TABLE[i] = Math.sin(angle);
      COS_TABLE[i] = Math.cos(angle);
    }

    const fastSin = (x: number) => {
      const absX = Math.abs(x);
      const index = Math.floor(((absX % (Math.PI * 2)) / (Math.PI * 2)) * 1024) & 1023;
      return SIN_TABLE[index] * (x < 0 ? -1 : 1);
    };

    const fastCos = (x: number) => {
      const absX = Math.abs(x);
      const index = Math.floor(((absX % (Math.PI * 2)) / (Math.PI * 2)) * 1024) & 1023;
      return COS_TABLE[index];
    };

    let frameCount = 0;
    let animationFrameId: number;
    const render = () => {
      const now = Date.now();
      const deltaTime = (now - lastTimeRef.current) * 0.001;
      lastTimeRef.current = now;

      // Gradual speed transition
      const targetSpeed = pathname === '/' ? 1.0 : 0.6;
      speedRef.current += (targetSpeed - speedRef.current) * 0.02; // Smooth transition

      timeRef.current += deltaTime * speedRef.current;
      const time = timeRef.current;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const u_x = (2 * x - width) / height;
          const u_y = (2 * y - height) / height;

          let a = 0;
          let d = 0;

          for (let i = 0; i < 4; i++) {
            a += fastCos(i - d + time * 0.5 - a * u_x);
            d += fastSin(i * u_y + a);
          }

          const wave = (fastSin(a) + fastCos(d)) * 0.5;
          const intensity = 0.3 + 0.4 * wave;
          const baseVal = 0.1 + 0.15 * fastCos(u_x + u_y + time * 0.3);
          const blueAccent = 0.2 * fastSin(a * 1.5 + time * 0.2);
          const purpleAccent = 0.15 * fastCos(d * 2 + time * 0.1);

          const r = Math.max(0, Math.min(1, baseVal + purpleAccent * 0.8)) * intensity;
          const g = Math.max(0, Math.min(1, baseVal + blueAccent * 0.6)) * intensity;
          const b = Math.max(0, Math.min(1, baseVal + blueAccent * 1.2 + purpleAccent * 0.4)) * intensity;

          const index = (y * width + x) * 4;
          data[index] = r * 255;
          data[index + 1] = g * 255;
          data[index + 2] = b * 255;
          data[index + 3] = 255;
        }
      }

      // Only redraw to screen every other frame
      frameCount++;
      if (frameCount % 2 === 0) {
        ctx.putImageData(imageData, 0, 0);
        if (SCALE > 1) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(canvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [pathname]);

  return (
    <motion.canvas 
      ref={canvasRef} 
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.9 }}
      transition={{ duration: 2, ease: "easeOut" }}
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none blur-[2px]" 
    />
  );
};

export default HeroWave;
