"use client";
import { motion } from 'framer-motion';

export function AnimatedWord({ word }: { word: string }) {
  const fullWord = word + ".";
  const letters = fullWord.split('');

  if (word === 'vibe') {
    return (
      <motion.span
        className="inline-block text-transparent bg-clip-text"
        style={{
          backgroundImage: 'linear-gradient(90deg, #ff595e, #ffca3a, #8ac926, #1982c4, #6a4c93, #ff595e)',
          backgroundSize: '200% 100%'
        }}
        animate={{ backgroundPosition: ['100% 50%', '0% 50%'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
      >
        {fullWord}
      </motion.span>
    );
  }

  if (word === 'pulse') {
    return (
      <motion.span
        className="inline-block"
        animate={{ scale: [1, 1.08, 1, 1.04, 1] }}
        transition={{ 
          duration: 1.5, 
          repeat: Infinity, 
          times: [0, 0.15, 0.3, 0.45, 1], 
          ease: 'easeInOut' 
        }}
      >
        {fullWord}
      </motion.span>
    );
  }

  if (word === 'drop') {
    return (
      <span className="inline-flex">
        {letters.map((char, i) => (
          <motion.span
            key={i}
            className="inline-block"
            animate={{ y: [0, 15, 0] }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              delay: i * 0.1, 
              ease: 'easeInOut' 
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </span>
    );
  }

  if (word === 'wave') {
    return (
      <span className="inline-flex">
        {letters.map((char, i) => (
          <motion.span
            key={i}
            className="inline-block"
            animate={{ y: [0, -12, 0, 12, 0] }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              delay: i * 0.15, 
              ease: 'linear' 
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </span>
    );
  }

  // fallback for "room" or anything else
  return <span className="inline-block">{fullWord}</span>;
}
