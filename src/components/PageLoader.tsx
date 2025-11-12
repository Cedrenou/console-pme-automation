"use client";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PageLoader = () => {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [pathname]);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 bg-[#151826] z-50 flex items-center justify-center">
      <div className="relative">
        {/* Route animée */}
        <div className="absolute -bottom-8 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gray-600 to-transparent overflow-hidden">
          <div className="h-full w-20 bg-gradient-to-r from-transparent via-white to-transparent animate-road-line"></div>
        </div>

        {/* Moto animée */}
        <div className="animate-bounce-gentle">
          <svg
            width="80"
            height="80"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="animate-motorcycle"
          >
            {/* Roue arrière */}
            <circle cx="16" cy="48" r="8" stroke="#3B82F6" strokeWidth="2" fill="none">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 16 48"
                to="360 16 48"
                dur="0.6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="16" cy="48" r="5" stroke="#3B82F6" strokeWidth="1" fill="none" />

            {/* Roue avant */}
            <circle cx="48" cy="48" r="8" stroke="#3B82F6" strokeWidth="2" fill="none">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 48 48"
                to="360 48 48"
                dur="0.6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="48" cy="48" r="5" stroke="#3B82F6" strokeWidth="1" fill="none" />

            {/* Cadre de la moto */}
            <path
              d="M 16 48 L 24 36 L 32 32 L 42 36 L 48 48"
              stroke="#60A5FA"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Réservoir */}
            <ellipse cx="28" cy="32" rx="6" ry="4" fill="#3B82F6" />

            {/* Guidon */}
            <path
              d="M 42 36 L 44 30 L 50 28"
              stroke="#60A5FA"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />

            {/* Siège */}
            <path
              d="M 24 36 L 30 36 Q 34 36 34 38"
              stroke="#3B82F6"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />

            {/* Pilote (casque) */}
            <circle cx="22" cy="26" r="5" fill="#60A5FA" />
            <ellipse cx="22" cy="27" rx="3" ry="2" fill="#1E3A8A" opacity="0.6" />

            {/* Corps du pilote */}
            <path
              d="M 22 31 L 24 36 L 20 36 Z"
              fill="#3B82F6"
            />
          </svg>
        </div>

        {/* Texte de chargement */}
        <div className="mt-12 text-center">
          <p className="text-blue-400 font-semibold text-lg animate-pulse">
            Chargement...
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes road-line {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(500%);
          }
        }

        @keyframes bounce-gentle {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        @keyframes motorcycle {
          0%, 100% {
            transform: rotate(-1deg);
          }
          50% {
            transform: rotate(1deg);
          }
        }

        .animate-road-line {
          animation: road-line 1s linear infinite;
        }

        .animate-bounce-gentle {
          animation: bounce-gentle 0.6s ease-in-out infinite;
        }

        .animate-motorcycle {
          animation: motorcycle 0.3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default PageLoader;
