import React, { useEffect, useRef } from 'react';
import './GoldenLinesBackground.css';

const GoldenLinesBackground = () => {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse tracking
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Golden lines configuration
    const lines = [];
    const numLines = 8;
    const lineSpeed = 0.5;

    // Initialize lines
    for (let i = 0; i < numLines; i++) {
      lines.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        angle: Math.random() * Math.PI * 2,
        length: 100 + Math.random() * 200,
        speed: lineSpeed + Math.random() * 0.3,
        opacity: 0.1 + Math.random() * 0.2,
      });
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw lines
      lines.forEach((line, index) => {
        // Update position
        line.x += Math.cos(line.angle) * line.speed;
        line.y += Math.sin(line.angle) * line.speed;

        // Wrap around edges
        if (line.x < 0) line.x = canvas.width;
        if (line.x > canvas.width) line.x = 0;
        if (line.y < 0) line.y = canvas.height;
        if (line.y > canvas.height) line.y = 0;

        // Mouse interaction - slight attraction
        const dx = mouseRef.current.x - line.x;
        const dy = mouseRef.current.y - line.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 300) {
          const influence = (300 - distance) / 300;
          line.angle += (Math.atan2(dy, dx) - line.angle) * influence * 0.02;
        }

        // Draw line
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(
          line.x + Math.cos(line.angle) * line.length,
          line.y + Math.sin(line.angle) * line.length
        );

        // Golden gradient
        const gradient = ctx.createLinearGradient(
          line.x,
          line.y,
          line.x + Math.cos(line.angle) * line.length,
          line.y + Math.sin(line.angle) * line.length
        );
        gradient.addColorStop(0, `rgba(212, 175, 55, ${line.opacity * 0.3})`);
        gradient.addColorStop(0.5, `rgba(212, 175, 55, ${line.opacity})`);
        gradient.addColorStop(1, `rgba(212, 175, 55, ${line.opacity * 0.3})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw connections between nearby lines
        lines.slice(index + 1).forEach((otherLine) => {
          const dx = otherLine.x - line.x;
          const dy = otherLine.y - line.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 200) {
            ctx.beginPath();
            ctx.moveTo(line.x, line.y);
            ctx.lineTo(otherLine.x, otherLine.y);
            ctx.strokeStyle = `rgba(212, 175, 55, ${(1 - distance / 200) * 0.1})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="golden-lines-background"
    />
  );
};

export default GoldenLinesBackground;
