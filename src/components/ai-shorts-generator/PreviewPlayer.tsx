import React, { useState, useEffect, useRef } from 'react';
import type { Clip, ProjectSettings, ParsedTextPart } from '../../types/ai-shorts-generator';

interface PreviewPlayerProps {
    clips: Clip[];
    settings: ProjectSettings;
    isOpen: boolean;
    onClose: () => void;
}

const parseTextAndBgOpacity = (text: string | undefined, defaultOpacity: number) => {
    const rawText = text || '';
    let bgOpacity = defaultOpacity;
    let cleanText = rawText;

    const bgOpacityRegex = /\[bg_opacity=(\d+)\]([\s\S]*?)\[\/bg_opacity\]/i;
    const match = rawText.match(bgOpacityRegex);

    if (match) {
        bgOpacity = parseInt(match[1], 10);
        cleanText = match[2];
    } else {
        // If no valid tag block is found, just remove any stray/broken tags
        // to avoid them being rendered on screen.
        cleanText = rawText.replace(/\[\/?bg_opacity(?:=\d+)?\]/gi, '');
    }

    // Clamp opacity value to be safe
    if (isNaN(bgOpacity) || bgOpacity < 0 || bgOpacity > 100) {
        bgOpacity = defaultOpacity;
    }

    return { cleanText, bgOpacity };
};


const parseColoredText = (text: string | undefined): ParsedTextPart[] => {
    if (!text) return [];
    const parts: ParsedTextPart[] = [];
    const regex = /\[color=(.*?)\](.*?)\[\/color\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: text.substring(lastIndex, match.index), color: 'white' });
        }
        parts.push({ text: match[2], color: match[1] });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push({ text: text.substring(lastIndex), color: 'white' });
    }
    return parts;
};

const containerClasses = {
    '1:1': 'w-[80vh] h-[80vh] aspect-square',
    '9:16': 'h-[90vh] aspect-[9/16]',
    '16:9': 'w-[90vw] aspect-[16/9]',
};

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({ clips, settings, isOpen, onClose }) => {
    const [currentClipIndex, setCurrentClipIndex] = useState(0);
    const [timeInClip, setTimeInClip] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const frameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const totalDuration = clips.reduce((acc, clip) => acc + (clip.audio?.duration || 0), 0);

    useEffect(() => {
        if (isOpen) {
            setCurrentClipIndex(0);
            setTimeInClip(0);
            setIsPlaying(true);
            lastTimeRef.current = performance.now();
            frameRef.current = requestAnimationFrame(animate);
        } else {
            setIsPlaying(false);
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        }
        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [isOpen, clips]);

    const animate = (now: number) => {
        if (!lastTimeRef.current) {
            lastTimeRef.current = now;
            frameRef.current = requestAnimationFrame(animate);
            return;
        }

        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;

        if (isPlaying) {
            setTimeInClip(prev => {
                let newTime = prev + delta;
                const currentClipDuration = clips[currentClipIndex]?.audio?.duration || Infinity;
                if (newTime >= currentClipDuration) {
                    if (currentClipIndex < clips.length - 1) {
                        setCurrentClipIndex(i => i + 1);
                        newTime = 0;
                    } else {
                        // End of video
                        setIsPlaying(false);
                        newTime = currentClipDuration;
                    }
                }
                return newTime;
            });
        }
        frameRef.current = requestAnimationFrame(animate);
    };

    if (!isOpen) return null;

    const currentClip = clips[currentClipIndex];
    if (!currentClip) return null;

    const containerClass = containerClasses[settings.aspectRatio];
    const PREVIEW_SCALE_FACTOR = 0.3;
    
    const { cleanText: subtitleText, bgOpacity: subtitleBgOpacity } = parseTextAndBgOpacity(currentClip.subtitle, 70);

    // --- Mobi Light Template ---
    if (settings.template === 'mobi-light') {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" onClick={onClose}>
                <div 
                    className={`relative ${containerClass} overflow-hidden bg-bg-light flex justify-center font-noto`} 
                    onClick={e => e.stopPropagation()}
                >
                    {/* Main Content Panel */}
                    <div className="w-full md:w-[90%] h-full bg-white flex flex-col">
                        {/* Header */}
                        <header className="bg-sky-500 text-white p-3 flex justify-between items-center flex-shrink-0">
                            <span className="material-icons">arrow_back_ios</span>
                            <div className="relative flex-grow mx-4">
                                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                                <div 
                                    className="w-full bg-white text-gray-800 rounded-full py-2 pl-10 pr-4"
                                    style={{ fontSize: `${settings.titleLine1FontSize * PREVIEW_SCALE_FACTOR}px` }}
                                >
                                    {settings.titleLine1}
                                </div>
                            </div>
                            <span className="material-icons">menu</span>
                        </header>
                        
                        {/* Body */}
                        <main className="p-4 flex-1 flex flex-col items-center overflow-y-auto">
                            <div className="border-b border-border-light pb-4 w-full text-center">
                                <h1 
                                    className="font-bold text-gray-800"
                                    style={{ fontSize: `${settings.titleLine2FontSize * PREVIEW_SCALE_FACTOR}px`, whiteSpace: 'pre-wrap', lineHeight: 1.2 }}
                                >
                                    {settings.titleLine2}
                                </h1>
                                <div 
                                    className="text-text-secondary mt-2"
                                    style={{ fontSize: `${settings.ctaFontSize * PREVIEW_SCALE_FACTOR}px` }}
                                >
                                    <span>{settings.ctaText}</span>
                                </div>
                            </div>
                            
                            <div className="mt-6 text-center flex-grow w-full flex flex-col justify-start items-center">
                                {/* Image/BG */}
                                <div className="w-48 h-auto mb-6">
                                    {currentClip.backgroundType === 'image' && currentClip.image ? (
                                        <img src={currentClip.image.objectUrl} className="w-full h-full object-contain" alt="Clip visual"/>
                                    ) : currentClip.backgroundType === 'color' ? (
                                        <div className="w-48 h-32 rounded" style={{backgroundColor: currentClip.backgroundColor}}></div>
                                    ) : null}
                                </div>

                                {/* Subtitle */}
                                <p 
                                    className="text-gray-700"
                                    style={{ fontSize: `${settings.subtitleFontSize * PREVIEW_SCALE_FACTOR}px`, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}
                                >
                                    {currentClip.subtitle}
                                </p>
                            </div>
                        </main>
                    </div>
                     <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl font-bold z-10">&times;</button>
                </div>
            </div>
        );
    }
    
    if (settings.template === 'exam-korean') {
        return (
             <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" onClick={onClose}>
                <div
                    className={`relative ${containerClass} overflow-hidden font-noto p-5`}
                    style={{ backgroundColor: '#F8F8F8' }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Paper */}
                    <div className="w-full h-full bg-white shadow-lg px-10 pt-20 pb-5 flex flex-col relative">
                        {/* Title */}
                        <h1
                            className="text-center font-bold border-b-4 border-black pb-4"
                            style={{
                                fontSize: `${settings.examTitleFontSize * PREVIEW_SCALE_FACTOR}px`,
                                color: '#333',
                            }}
                        >
                            {settings.examTitle}
                        </h1>

                        {/* Info Box */}
                        <div
                            className="flex justify-center items-center gap-4 my-6"
                            style={{ fontSize: `${settings.examInfoFontSize * PREVIEW_SCALE_FACTOR}px` }}
                        >
                            {/* Name */}
                            <div className="flex items-center gap-2">
                                <span className="font-bold bg-gray-100 border border-gray-300 px-2 py-1">성명</span>
                                <span className="border border-gray-300 px-3 py-1">{settings.examName}</span>
                            </div>
                            {/* Subject */}
                            <div className="flex items-center gap-2">
                                <span className="font-bold bg-gray-100 border border-gray-300 px-2 py-1">과목명</span>
                                <span className="border border-gray-300 px-3 py-1">{settings.examSubject}</span>
                            </div>
                        </div>

                        {/* Grade */}
                        <div
                            className="absolute text-red-500 font-bold"
                            style={{
                                fontSize: `${120 * PREVIEW_SCALE_FACTOR}px`,
                                top: '6%',
                                right: '5%',
                            }}
                        >
                            A+
                            <div className="absolute bg-red-500 transform -rotate-12" style={{ bottom: '15%', right: '0%', width: '100%', height: '4px' }}></div>
                            <div className="absolute bg-red-500 transform -rotate-12" style={{ bottom: '25%', right: '0%', width: '100%', height: '4px' }}></div>
                        </div>

                        {/* Image Area */}
                        <div className="flex-1 relative flex items-center justify-center mt-4">
                            {currentClip.backgroundType === 'image' && currentClip.image ? (
                                <img src={currentClip.image.objectUrl} className="max-w-full max-h-full object-contain" alt="Clip visual"/>
                            ) : (
                                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500">Image Area</div>
                            )}

                            {/* Subtitle */}
                            {currentClip.subtitle && (
                                <div
                                    className="absolute left-1/2 w-11/12 px-4 text-center"
                                    style={{
                                        bottom: '5%',
                                        transform: 'translateX(-50%)',
                                        fontFamily: "'NanumSquare', sans-serif"
                                    }}
                                >
                                    <div
                                        className="inline-block px-4 py-2 rounded-lg"
                                        style={{ backgroundColor: `rgba(0, 0, 0, ${0.6 * (subtitleBgOpacity / 100)})` }}
                                    >
                                        <p
                                            className="font-bold"
                                            style={{
                                                fontSize: `${settings.subtitleFontSize * PREVIEW_SCALE_FACTOR}px`,
                                                WebkitTextStroke: `${settings.subtitleStrokeSize * PREVIEW_SCALE_FACTOR}px black`,
                                                paintOrder: 'stroke fill',
                                                whiteSpace: 'pre-wrap',
                                                textAlign: 'center',
                                            }}
                                        >
                                            {parseColoredText(subtitleText).map((part, i) => (
                                                <span key={i} style={{ color: part.color }}>{part.text}</span>
                                            ))}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                         {/* CTA Section */}
                        <div className="flex-shrink-0 pt-2 mt-2">
                            {/* Separator */}
                            <div className="w-full border-t border-gray-200"></div>
                            {/* CTA Text */}
                            {settings.ctaText && (
                                <p 
                                    className="text-center text-gray-500 mt-2"
                                    style={{
                                        fontSize: `${settings.ctaFontSize * PREVIEW_SCALE_FACTOR}px`,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {settings.ctaText}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="absolute top-2 right-2 text-gray-800 text-3xl font-bold z-10">&times;</button>
                </div>
            </div>
        );
    }
    
    // --- Classic Dark Template (default) ---
    const { cleanText: ctaText, bgOpacity: ctaBgOpacity } = parseTextAndBgOpacity(settings.ctaText, 70);
    const backgroundStyle = currentClip.backgroundType === 'color'
        ? { backgroundColor: currentClip.backgroundColor }
        : { backgroundColor: '#18181b' }; // zinc-900 equivalent

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" onClick={onClose}>
            <div className={`relative ${containerClass} rounded-lg overflow-hidden`} style={backgroundStyle} onClick={e => e.stopPropagation()}>
                
                {/* Top Guideline (relative to video frame) */}
                <div className="absolute w-full border-t-2 border-yellow-400 border-dashed" style={{ top: `${settings.topGuideline}%` }}></div>
                
                {/* CTA Guideline (relative to video frame) */}
                <div className="absolute w-full border-t-2 border-yellow-400 border-dashed" style={{ top: `${settings.ctaGuideline}%` }}></div>
                
                {/* Title (relative to video frame) */}
                <div
                    className="absolute left-0 w-full px-8 text-center"
                    style={{
                        top: `${settings.topGuideline}%`,
                        transform: 'translateY(-50%)', // Vertically center the whole text block
                        fontFamily: "'NanumSquare', sans-serif"
                    }}
                >
                    {settings.titleLine1 && (
                        <div
                            className="font-black"
                            style={{
                                fontSize: `${settings.titleLine1FontSize * PREVIEW_SCALE_FACTOR}px`,
                                WebkitTextStroke: `${settings.titleLine1StrokeSize * PREVIEW_SCALE_FACTOR}px black`,
                                paintOrder: 'stroke fill',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {parseColoredText(settings.titleLine1).map((part, i) => (
                                <span key={i} style={{ color: part.color }}>{part.text}</span>
                            ))}
                        </div>
                    )}
                    {settings.titleLine2 && (
                         <div
                            className="font-black"
                            style={{
                                fontSize: `${settings.titleLine2FontSize * PREVIEW_SCALE_FACTOR}px`,
                                WebkitTextStroke: `${settings.titleLine2StrokeSize * PREVIEW_SCALE_FACTOR}px black`,
                                paintOrder: 'stroke fill',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {parseColoredText(settings.titleLine2).map((part, i) => (
                                <span key={i} style={{ color: part.color }}>{part.text}</span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Main Content Area (Image, Subtitle, CTA) - Flexbox for vertical flow */}
                <div
                    className="absolute w-full flex flex-col items-center px-8"
                    style={{
                        top: `${settings.topGuideline}%`, // Start below the title area
                        paddingTop: '50px', // Add some padding below title
                        height: `calc(${100 - settings.topGuideline}% - ${100 - settings.bottomGuideline}%)`, // Fill remaining space
                        overflowY: 'auto', // Allow scrolling if content is too tall
                    }}
                >
                    {/* Image/BG */}
                    {currentClip.backgroundType === 'image' && currentClip.image && (
                        <img
                            ref={imageRef}
                            src={currentClip.image.objectUrl}
                            className="max-w-full h-auto object-contain" // Scale to fit width, maintain aspect ratio, contain within bounds
                            style={{
                                // Apply imageScale here if it means a maximum scale, not a forced scale
                                // For now, let's rely on max-w-full and object-contain
                                transform: `scale(${settings.imageScale / 100})`, // Apply scale here
                                transformOrigin: 'center center', // Scale from center
                                // imageX and imageY are problematic with flexbox, might need to be removed or reinterpreted
                            }}
                            alt="Clip visual"
                        />
                    )}
                    
                    {/* Subtitle */}
                    {currentClip.subtitle && (
                         <div
                            className="mt-4 px-4 text-center" // Add margin-top to separate from image
                        >
                            <div 
                                className="inline-block px-4 py-2 rounded-lg"
                                style={{backgroundColor: `rgba(0, 0, 0, ${0.6 * (subtitleBgOpacity / 100)})`}}
                            >
                                <p
                                    className="font-bold"
                                    style={{
                                        fontSize: `${settings.subtitleFontSize * PREVIEW_SCALE_FACTOR}px`,
                                        WebkitTextStroke: `${settings.subtitleStrokeSize * PREVIEW_SCALE_FACTOR}px black`,
                                        paintOrder: 'stroke fill',
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {parseColoredText(subtitleText).map((part, i) => (
                                        <span key={i} style={{ color: part.color }}>{part.text}</span>
                                    ))}
                                </p>
                            </div>
                        </div>
                    )}
                    
                     {/* CTA */}
                    {settings.ctaText && (
                        <div
                            className="mt-4 px-4 text-center" // Add margin-top to separate from subtitle
                        >
                            <div 
                                className="inline-block px-4 py-2 rounded-lg"
                                style={{backgroundColor: `rgba(0, 0, 0, ${0.6 * (ctaBgOpacity/100)})`}}
                            >
                                <p
                                    className="font-bold"
                                    style={{
                                        fontSize: `${settings.ctaFontSize * PREVIEW_SCALE_FACTOR}px`,
                                        WebkitTextStroke: `${settings.ctaStrokeSize * PREVIEW_SCALE_FACTOR}px black`,
                                        paintOrder: 'stroke fill',
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {parseColoredText(ctaText).map((part, i) => (
                                        <span key={i} style={{ color: part.color }}>{part.text}</span>
                                    ))}
                                </p>
                            </div>
                        </div>
                    )}
                </div> {/* End of Main Content Area */}

                {/* Bottom Guideline (relative to video frame) */}
                <div className="absolute w-full border-t-2 border-blue-400 border-dashed" style={{ bottom: `${settings.bottomGuideline}%` }}></div>
                
                <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl font-bold z-10">&times;</button>
            </div>
        </div>
    );
};
