import React from 'react';

export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img 
      src="https://ais-dev-z2g4wd7vpug5uun5r5yobt-167678333957.us-west1.run.app/api/files/download/28d0119e-e8b2-4d2c-8822-fd647575231c?token=WyIyOGQwMTE5ZS1lOGIyLTRkMmMtODgyMi1mZDY0NzU3NTIzMWMiXQ.ZzL19Q.P7yX6cM5Aoz7q9WfXF7Hov-iB5U" 
      alt="TalkToStellar Logo"
      className={`object-cover rounded-full ${className}`} 
    />
  );
}
