/// <reference lib="dom" />

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
    createId, parseColoredText, drawTextWithStroke, drawStyledTextWithBackground, 
    drawMultilineText, naturalSort, generateSubtitleFromFilename, getDefaultSubtitleY,
    RENDER_DIMENSIONS, FPS, DEFAULT_CLIP_DURATION, aspectRatioClasses, TEMPLATE_PRESETS
} from './utils';
import type { MediaFile, Clip, ProjectSettings, ParsedTextPart, AspectRatio, Template, InitialShortData } from '../../types/ai-shorts-generator';
import { FileUploadZone } from './FileUploadZone';
import { PreviewPlayer } from './PreviewPlayer';
import { SettingsModal } from './SettingsModal';
import {
    ImageIcon, AudioIcon, DownloadIcon, TrashIcon, GripVerticalIcon,
    PlayIcon, PauseIcon, PlusCircleIcon
} from './icons';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';


// --- Components ---
const SortableClip = ({ clip, isSelected, onClick, onDelete }: { clip: Clip, isSelected: boolean, onClick: () => void, onDelete: () => void }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clip.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const duration = clip.audio?.duration ?? DEFAULT_CLIP_DURATION;

    return (
        <div ref={setNodeRef} style={style} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 ring-2 ring-brand-blue' : 'bg-panel-light hover:bg-item-hover'}`} onClick={onClick}>
            <button {...attributes} {...listeners} className="cursor-grab text-text-secondary p-1"><GripVerticalIcon className="w-5 h-5" /></button>
            {clip.backgroundType === 'image' && clip.image ? (
                <img src={clip.image.objectUrl} alt="clip thumbnail" className="w-16 h-16 object-cover rounded-md" />
            ) : (
                <div style={{ backgroundColor: clip.backgroundType === 'color' ? clip.backgroundColor : '#e5e7eb' }} className="w-16 h-16 flex items-center justify-center rounded-md text-gray-500">
                    {clip.backgroundType === 'image' && <ImageIcon className="w-8 h-8" />}
                </div>
            )}
            <div className="flex-1 text-sm overflow-hidden">
                <p className="font-semibold truncate">
                    BG: {clip.backgroundType === 'image' 
                        ? (clip.image?.file.name ?? 'None') 
                        : clip.backgroundColor}
                </p>
                <p className="text-text-secondary truncate">Audio: {clip.audio?.file.name ?? 'None'}</p>
                <p className="text-text-secondary truncate">Duration: {duration.toFixed(2)}s</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><TrashIcon className="w-5 h-5" /></button>
        </div>
    );
};

interface ClassicEditorProps {
    initialShortData?: InitialShortData;
}

export function ClassicEditor({ initialShortData }: ClassicEditorProps) {
    // --- State ---
    const [images, setImages] = useState<MediaFile[]>([]);
    const [audios, setAudios] = useState<MediaFile[]>([]);
    const [clips, setClips] = useState<Clip[]>([]);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [selectedStagedImageId, setSelectedStagedImageId] = useState<string | null>(null);
    const [settings, setSettings] = useState<ProjectSettings>({
        aspectRatio: '9:16',
        template: 'classic-dark',
        imageX: 50, // Default for new projects
        imageY: 50, // Default for new projects
        imageScale: 100, // Default for new projects
        topGuideline: 15,
        bottomGuideline: 10,
        ctaGuideline: 85,
        ...TEMPLATE_PRESETS['classic-dark'],
    });
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isRendering, setIsRendering] = useState(false);
    const [renderProgress, setRenderProgress] = useState(0);
    const [renderMessage, setRenderMessage] = useState('');
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [imageLoadedNonce, setImageLoadedNonce] = useState(0);

    // --- Refs ---
    const playbackFrameRef = useRef(0);
    const lastTimestampRef = useRef(0);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageElements = useRef<{[key: string]: HTMLImageElement}>({});
    const audioRef = useRef<HTMLAudioElement>(null);

    // --- Memos and Derived State ---
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    const selectedClip = clips.find(c => c.id === selectedClipId);
    const totalDuration = useMemo(() => clips.reduce((sum, c) => sum + (c.audio?.duration || DEFAULT_CLIP_DURATION), 0), [clips]);
    
    const { width: RENDER_WIDTH, height: RENDER_HEIGHT } = RENDER_DIMENSIONS[settings.aspectRatio];
    
    const currentPlaybackData = useMemo(() => {
        let accumulatedTime = 0;
        if (totalDuration === 0 || playbackTime >= totalDuration) {
             return { clipIndex: clips.length - 1, timeInClip: clips[clips.length - 1]?.audio?.duration || DEFAULT_CLIP_DURATION, clip: clips[clips.length - 1] };
        }
        for(let i=0; i<clips.length; i++) {
            const clip = clips[i];
            const duration = clip.audio?.duration || DEFAULT_CLIP_DURATION;
            if (playbackTime < accumulatedTime + duration) {
                return { clipIndex: i, timeInClip: playbackTime - accumulatedTime, clip };
            }
            accumulatedTime += duration;
        }
        return { clipIndex: 0, timeInClip: 0, clip: clips[0] };
    }, [playbackTime, clips, totalDuration]);

    // --- Initial Data Loading Effect ---
    useEffect(() => {
        if (initialShortData && initialShortData.images.length > 0 && initialShortData.script) {
            const { script, images: imageUrls } = initialShortData;
            const scriptTexts = [script.hook, script.immersion, script.body, script.cta].filter(Boolean);

            // Create MediaFile objects from URLs
            const initialImageFiles: MediaFile[] = imageUrls.slice(0, scriptTexts.length).map((url, index) => ({
                id: createId(),
                file: new File([], `image_${index}.png`), // Dummy file
                objectUrl: url,
            }));
            setImages(initialImageFiles);

            // Create Clip objects
            const initialClips: Clip[] = scriptTexts.map((text, index) => {
                const imageFile = initialImageFiles[index];
                return {
                    id: createId(),
                    subtitle: text,
                    image: imageFile,
                    backgroundType: 'image',
                    backgroundColor: '#18181b',
                };
            });
            setClips(initialClips);
        }
    }, [initialShortData]);
    
    // --- Frame Drawing ---
    const drawMediaFrame = (ctx: CanvasRenderingContext2D, clip: Clip) => {
        // Draw user-controlled image first, if it exists.
        // This logic is now shared across all templates.
        const drawUserImage = () => {
            if (clip.image && clip.backgroundType === 'image') {
                const img = imageElements.current[clip.image.id];
                if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const scale = (settings.imageScale ?? 100) / 100;
                    let destWidth = img.width * scale;
                    let destHeight = img.height * scale;

                    const destX = (RENDER_WIDTH - destWidth) / 2;
                    let destY;

                    let minY = 0;
                    let maxY = RENDER_HEIGHT;

                    // Determine available vertical space based on template
                    if (settings.template === 'classic-dark') {
                        const titleY = RENDER_HEIGHT * (settings.topGuideline / 100);
                        const lines1 = settings.titleLine1 ? settings.titleLine1.split('\n') : [];
                        const lines2 = settings.titleLine2 ? settings.titleLine2.split('\n') : [];
                        const lineHeight1 = lines1.length > 0 ? settings.titleLine1FontSize * 1.2 : 0;
                        const lineHeight2 = lines2.length > 0 ? settings.titleLine2FontSize * 1.2 : 0;
                        const totalTitleHeight = (lines1.length * lineHeight1) + (lines2.length * lineHeight2);
                        minY = titleY + totalTitleHeight / 2; // Bottom of title area

                        const subtitleY = RENDER_HEIGHT * ((100 - settings.bottomGuideline) / 100);
                        const ctaY = RENDER_HEIGHT * (settings.ctaGuideline / 100);
                        maxY = Math.min(subtitleY, ctaY); // Top of subtitle/CTA area
                    } else if (settings.template === 'mobi-light') {
                        const headerHeight = RENDER_HEIGHT * 0.08;
                        const titleY = headerHeight + RENDER_HEIGHT * 0.06;
                        const metaY = titleY + RENDER_HEIGHT * 0.06;
                        minY = metaY + RENDER_HEIGHT * 0.04; // Below divider
                        maxY = RENDER_HEIGHT * ((100 - settings.bottomGuideline) / 100); // Subtitle Y
                    } else if (settings.template === 'exam-korean') {
                        const paperPadding = RENDER_WIDTH * 0.05;
                        const paperY = paperPadding;
                        const paperHeight = RENDER_HEIGHT - paperPadding * 2;
                        let currentY = paperY + 60; // Start of title area

                        if (settings.examTitle) {
                            const lineHeight1 = settings.examTitleFontSize * 1.2;
                            currentY += lineHeight1;
                        }
                        if (settings.examTitleLine2) {
                            const lineHeight2 = settings.examTitleLine2FontSize * 1.2;
                            currentY += lineHeight2;
                        }
                        minY = currentY + 25; // Below underline and info box
                        maxY = paperY + paperHeight - 80; // Above separator
                    }

                    const availableHeight = maxY - minY;

                    if (destHeight > availableHeight) {
                        // If image is too tall, scale it down to fit
                        destHeight = availableHeight;
                        destWidth = (img.width / img.height) * destHeight; // Maintain aspect ratio
                    }

                    // Position the image:
                    // If there's enough space, center it within the available area.
                    // Otherwise, place it at the top of the available area.
                    if (destHeight < availableHeight) {
                        destY = minY + (availableHeight - destHeight) / 2;
                    } else {
                        destY = minY;
                    }
                    
                    ctx.drawImage(img, destX, destY, destWidth, destHeight);
                } else if (img && !img.complete) {
                    console.warn(`Image ${clip.image.id} not yet complete for drawing.`);
                } else if (img && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
                    console.error(`Image ${clip.image.id} is broken (naturalWidth or naturalHeight is 0).`);
                }
            }
        };

        if (settings.template === 'mobi-light') {
            ctx.fillStyle = '#f1f3f4';
            ctx.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
            
            const appWidth = RENDER_WIDTH;
            const appHeight = RENDER_HEIGHT;
            const appX = 0;
            const appY = 0;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(appX, appY, appWidth, appHeight);

            // Draw image below the main UI but above the white background
            drawUserImage();

            // Header UI
            const headerHeight = appHeight * 0.08;
            ctx.fillStyle = '#0ea5e9';
            ctx.fillRect(appX, appY, appWidth, headerHeight);

            ctx.save();
            ctx.font = `${headerHeight * 0.45}px "Material Icons"`;
            ctx.fillStyle = 'white';
            ctx.textBaseline = 'middle';
            const iconMargin = appWidth * 0.05;
            ctx.textAlign = 'left';
            ctx.fillText('arrow_back_ios', appX + iconMargin, appY + headerHeight / 2);
            ctx.textAlign = 'right';
            ctx.fillText('menu', appX + appWidth - iconMargin, appY + headerHeight / 2);

            const searchBarLeftEdge = appX + iconMargin + (headerHeight * 0.6);
            const searchBarRightEdge = appX + appWidth - iconMargin - (headerHeight * 0.4);
            const searchBarWidth = searchBarRightEdge - searchBarLeftEdge;
            const searchBarHeight = headerHeight * 0.65;
            const searchBarX = searchBarLeftEdge;
            const searchBarY = appY + (headerHeight - searchBarHeight) / 2;
            
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.roundRect(searchBarX, searchBarY, searchBarWidth, searchBarHeight, searchBarHeight / 2);
            ctx.fill();

            ctx.font = `${searchBarHeight * 0.5}px "Material Icons"`;
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'left';
            const searchIconX = searchBarX + (searchBarHeight * 0.3);
            ctx.fillText('search', searchIconX, appY + headerHeight / 2);
            
            ctx.font = `400 ${settings.titleLine1FontSize}px "Noto Sans KR"`;
            ctx.fillStyle = '#374151';
            const searchTextX = searchIconX + (searchBarHeight * 0.7);
            ctx.fillText(settings.titleLine1, searchTextX, appY + headerHeight / 2);
            ctx.restore();

            // Main content text
            const contentPadding = appWidth * 0.08;
            const titleY = appY + headerHeight + appHeight * 0.06;
            drawMultilineText(ctx, settings.titleLine2, appX + appWidth / 2, titleY, settings.titleLine2FontSize, settings.titleLine2FontSize * 1.2, '#111827', 'center', 'bold');
            
            const metaY = titleY + appHeight * 0.06;
            drawMultilineText(ctx, settings.ctaText, appX + appWidth / 2, metaY, settings.ctaFontSize, settings.ctaFontSize * 1.2, '#6b7280', 'center', 'normal');
            
            const dividerY = metaY + appHeight * 0.04;
            ctx.save();
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(appX + contentPadding, dividerY);
            ctx.lineTo(appX + appWidth - contentPadding, dividerY);
            ctx.stroke();
            ctx.restore();

            const subtitleY = RENDER_HEIGHT * ((100 - settings.bottomGuideline) / 100);
            drawMultilineText(ctx, clip.subtitle || '', appX + appWidth / 2, subtitleY, settings.subtitleFontSize, settings.subtitleFontSize * 1.3, '#374151', 'center', 'normal');

        } else if (settings.template === 'exam-korean') {
            ctx.fillStyle = '#F8F8F8';
            ctx.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);

            const paperPadding = RENDER_WIDTH * 0.05;
            const paperX = paperPadding;
            const paperY = paperPadding;
            const paperWidth = RENDER_WIDTH - paperPadding * 2;
            const paperHeight = RENDER_HEIGHT - paperPadding * 2;

            ctx.save();
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;
            ctx.fillRect(paperX, paperY, paperWidth, paperHeight);
            ctx.restore();

            // Draw user-controlled image on top of the paper
            drawUserImage();
            
            const contentPadding = paperWidth * 0.1;
            const contentWidth = paperWidth - contentPadding * 2;
            let currentY = paperY + 60;
            const contentCenterX = paperX + paperWidth / 2;

            // --- TITLE ---
            ctx.save();
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (settings.examTitle) {
                const lineHeight1 = settings.examTitleFontSize * 1.2;
                ctx.font = `bold ${settings.examTitleFontSize}px "Noto Sans KR"`;
                ctx.fillText(settings.examTitle, contentCenterX, currentY + lineHeight1 / 2);
                currentY += lineHeight1;
            }

            if (settings.examTitleLine2) {
                const lineHeight2 = settings.examTitleLine2FontSize * 1.2;
                ctx.font = `bold ${settings.examTitleLine2FontSize}px "Noto Sans KR"`;
                ctx.fillText(settings.examTitleLine2, contentCenterX, currentY + lineHeight2 / 2);
                currentY += lineHeight2;
            }
            
            currentY += 15; // Space before underline

            ctx.strokeStyle = '#333';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(contentCenterX - contentWidth / 2, currentY);
            ctx.lineTo(contentCenterX + contentWidth / 2, currentY);
            ctx.stroke();
            ctx.restore();

            currentY += 25; // Space after underline

            // --- INFO BOX ---
            const boxHeight = settings.examInfoFontSize * 1.4;
            const infoY = currentY + boxHeight / 2;
            ctx.save();
            ctx.font = `bold ${settings.examInfoFontSize}px "Noto Sans KR"`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const nameLabel = '성명';
            const subjectLabel = '과목명';
            const nameLabelWidth = ctx.measureText(nameLabel).width;
            const subjectLabelWidth = ctx.measureText(subjectLabel).width;
            const nameValueWidth = ctx.measureText(settings.examName).width;
            const subjectValueWidth = ctx.measureText(settings.examSubject).width;

            const horizontalPadding = boxHeight * 0.3;
            const itemGap = 40;

            const totalInfoWidth = (nameLabelWidth + horizontalPadding * 2) + (nameValueWidth + horizontalPadding * 2) + itemGap + (subjectLabelWidth + horizontalPadding * 2) + (subjectValueWidth + horizontalPadding * 2) + 20;
            let infoCurrentX = paperX + (paperWidth - totalInfoWidth) / 2;

            ctx.lineWidth = 2;

            const drawInfoBox = (text: string, isLabel: boolean) => {
                const textWidth = ctx.measureText(text).width;
                const boxWidth = textWidth + horizontalPadding * 2;
                ctx.fillStyle = isLabel ? '#F3F4F6' : 'white';
                ctx.strokeStyle = '#D1D5DB';
                ctx.beginPath();
                ctx.roundRect(infoCurrentX, infoY - boxHeight / 2, boxWidth, boxHeight, 8);
                if (isLabel) ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#333';
                ctx.fillText(text, infoCurrentX + horizontalPadding, infoY);
                infoCurrentX += boxWidth + (isLabel ? 10 : itemGap);
            };

            drawInfoBox(nameLabel, true);
            drawInfoBox(settings.examName, false);
            drawInfoBox(subjectLabel, true);
            drawInfoBox(settings.examSubject, false);
            ctx.restore();

            // --- GRADE ---
            ctx.save();
            ctx.font = `bold ${RENDER_WIDTH * 0.12}px "Noto Sans KR"`;
            ctx.fillStyle = '#EF4444';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            const gradeX = paperX + paperWidth - contentPadding * 0.8;
            const gradeY = paperY + contentPadding * 0.6;
            ctx.fillText('A+', gradeX, gradeY);

            const gradeMetrics = ctx.measureText('A+');
            const gradeHeight = gradeMetrics.actualBoundingBoxAscent + gradeMetrics.actualBoundingBoxDescent;
            const gradeBottom = gradeY + gradeHeight;

            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(gradeX - gradeMetrics.width * 1.1, gradeBottom * 0.85);
            ctx.lineTo(gradeX, gradeBottom * 0.8);
            ctx.moveTo(gradeX - gradeMetrics.width * 1.1, gradeBottom * 0.95);
            ctx.lineTo(gradeX, gradeBottom * 0.9);
            ctx.stroke();
            ctx.restore();

            // --- SUBTITLE & CTA ---
            if (clip.subtitle) {
                const subtitleY = RENDER_HEIGHT * ((100 - settings.bottomGuideline) / 100);
                drawStyledTextWithBackground(ctx, clip.subtitle, paperX + paperWidth / 2, subtitleY, 70, settings.subtitleFontSize, settings.subtitleStrokeSize);
            }
            
            const separatorY = paperY + paperHeight - 80;
            ctx.save();
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(paperX + contentPadding, separatorY);
            ctx.lineTo(paperX + paperWidth - contentPadding, separatorY);
            ctx.stroke();
            ctx.restore();

            if (settings.ctaText) {
                const ctaY = separatorY + 40;
                drawMultilineText(ctx, settings.ctaText, paperX + paperWidth / 2, ctaY, settings.ctaFontSize, settings.ctaFontSize * 1.2, '#5f6368', 'center', 'normal');
            }

        } else { // Classic Dark Template
            if (clip.backgroundType === 'color') {
                ctx.fillStyle = clip.backgroundColor;
                ctx.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
            } else {
                ctx.fillStyle = '#18181b';
                ctx.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
            }

            drawUserImage();
            
            const titleY = RENDER_HEIGHT * (settings.topGuideline / 100);

            const lines1 = settings.titleLine1 ? settings.titleLine1.split('\n') : [];
            const lines2 = settings.titleLine2 ? settings.titleLine2.split('\n') : [];
            
            const lineHeight1 = lines1.length > 0 ? settings.titleLine1FontSize * 1.2 : 0;
            const lineHeight2 = lines2.length > 0 ? settings.titleLine2FontSize * 1.2 : 0;
            const totalTitleHeight = (lines1.length * lineHeight1) + (lines2.length * lineHeight2);
            let currentTitleY = titleY - totalTitleHeight / 2;

            if (lines1.length > 0) {
                ctx.font = `900 ${settings.titleLine1FontSize}px "NanumSquare"`;
                const parsedParts1 = parseColoredText(settings.titleLine1);
                drawTextWithStroke(ctx, parsedParts1, RENDER_WIDTH / 2, currentTitleY + lineHeight1 / 2, settings.titleLine1StrokeSize);
                currentTitleY += lineHeight1;
            }

            if (lines2.length > 0) {
                 ctx.font = `900 ${settings.titleLine2FontSize}px "NanumSquare"`;
                const parsedParts2 = parseColoredText(settings.titleLine2);
                drawTextWithStroke(ctx, parsedParts2, RENDER_WIDTH / 2, currentTitleY + lineHeight2 / 2, settings.titleLine2StrokeSize);
            }
            
            if (clip.subtitle) {
                const subtitleY = RENDER_HEIGHT * ((100 - settings.bottomGuideline) / 100);
                drawStyledTextWithBackground(ctx, clip.subtitle, RENDER_WIDTH / 2, subtitleY, 70, settings.subtitleFontSize, settings.subtitleStrokeSize);
            }

            if (settings.ctaText) {
                const ctaY = RENDER_HEIGHT * (settings.ctaGuideline / 100);
                drawStyledTextWithBackground(ctx, settings.ctaText, RENDER_WIDTH / 2, ctaY, 70, settings.ctaFontSize, settings.ctaStrokeSize);
            }
        }
    };
    
    const drawFrame = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
        if (!ctx) return;
        
        ctx.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);

        let accumulatedTime = 0;
        let activeClip: Clip | null = null;
        for (const clip of clips) {
            const duration = clip.audio?.duration || DEFAULT_CLIP_DURATION;
            if (time < accumulatedTime + duration) {
                activeClip = clip;
                break;
            }
            accumulatedTime += duration;
        }

        if (!activeClip && clips.length > 0) {
            activeClip = clips[clips.length-1];
        }

        if (activeClip) {
            drawMediaFrame(ctx, activeClip);
        } else {
             ctx.fillStyle = '#e5e7eb';
             ctx.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
             ctx.fillStyle = '#9ca3af';
             ctx.font = '48px sans-serif';
             ctx.textAlign = 'center';
             ctx.fillText('Add clips to start', RENDER_WIDTH / 2, RENDER_HEIGHT / 2);
        }

    }, [clips, settings, imageLoadedNonce]);


    // --- Playback Animation Loop ---
    const animatePlayback = (timestamp: number) => {
        if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
        const deltaTime = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;

        if (isPlaying) {
            setPlaybackTime(prevTime => {
                const newTime = prevTime + deltaTime;
                if (newTime >= totalDuration) {
                    setIsPlaying(false);
                    return totalDuration;
                }
                return newTime;
            });
        }
        playbackFrameRef.current = requestAnimationFrame(animatePlayback);
    };

    useEffect(() => {
        playbackFrameRef.current = requestAnimationFrame(animatePlayback);
        return () => cancelAnimationFrame(playbackFrameRef.current);
    }, [isPlaying, totalDuration]);

    useEffect(() => {
        const canvas = previewCanvasRef.current;
        if (canvas) {
            canvas.width = RENDER_WIDTH;
            canvas.height = RENDER_HEIGHT;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                drawFrame(ctx, playbackTime);
            }
        }
    }, [playbackTime, drawFrame, RENDER_WIDTH, RENDER_HEIGHT]);
    
    // --- Handlers ---
    const handlePlayPause = () => {
        setIsPlaying(prev => !prev);
    };

    const handleFileDrop = async (droppedFiles: File[], type: 'image' | 'audio') => {
        const newMediaFiles: MediaFile[] = await Promise.all(droppedFiles.map(async (file) => {
            const objectUrl = URL.createObjectURL(file);
            let duration: number | undefined;
            if (type === 'audio') {
                try {
                    const audioEl = document.createElement('audio');
                    audioEl.src = objectUrl;
                    await new Promise((resolve, reject) => {
                        audioEl.addEventListener('loadedmetadata', () => {
                            duration = audioEl.duration;
                            resolve(duration);
                        });
                        audioEl.addEventListener('error', reject);
                    });
                } catch (e) {
                    console.error("Could not get audio duration", e);
                }
            }
            if (type === 'image') {
                 const img = new Image();
                 img.src = objectUrl;
                 imageElements.current[file.name] = img; // Preload
            }
            return { id: createId(), file, objectUrl, duration };
        }));

        if (type === 'image') {
            setImages(prev => [...prev, ...newMediaFiles].sort((a, b) => naturalSort(a.file.name, b.file.name)));
        } else {
            setAudios(prev => [...prev, ...newMediaFiles].sort((a, b) => naturalSort(a.file.name, b.file.name)));
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setClips((items) => {
                const oldIndex = items.findIndex(item => item.id === active.id);
                const newIndex = items.findIndex(item => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleTimelineClipClick = (clipId: string) => {
        setSelectedClipId(clipId === selectedClipId ? null : clipId);
    };

    const handleAddEmptyClip = () => {
        const newClip: Clip = {
            id: createId(),
            subtitle: 'New clip subtitle',
            backgroundType: 'color',
            backgroundColor: '#1e293b',
        };
        setClips(prev => [...prev, newClip]);
        setSelectedClipId(newClip.id);
    };

    const handleDeleteClip = (clipId: string) => {
        setClips(prev => prev.filter(c => c.id !== clipId));
        if (selectedClipId === clipId) {
            setSelectedClipId(null);
        }
    };

    const handleClipSubtitleChange = (clipId: string, subtitle: string) => {
        setClips(prev => prev.map(c => c.id === clipId ? { ...c, subtitle } : c));
    };

    const handleClipBackgroundTypeChange = (clipId: string, type: 'image' | 'color') => {
        setClips(prev => prev.map(c => c.id === clipId ? { ...c, backgroundType: type } : c));
    };

    const handleClipBackgroundColorChange = (clipId: string, color: string) => {
        setClips(prev => prev.map(c => c.id === clipId ? { ...c, backgroundColor: color } : c));
    };

    const handleClipImageChange = (clipId: string, imageId: string) => {
        const image = images.find(img => img.id === imageId);
        setClips(prev => prev.map(c => {
            if (c.id === clipId) {
                // Also force background type to image
                return { ...c, image: image, backgroundType: 'image' };
            }
            return c;
        }));
    };

    const handleClipAudioChange = (clipId: string, audioId: string) => {
        const audio = audios.find(aud => aud.id === audioId);
        setClips(prev => prev.map(c => c.id === clipId ? { ...c, audio } : c));
    };
    
    const handleStringSettingsChange = (key: keyof ProjectSettings, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleNumericSettingsChange = (key: keyof ProjectSettings, value: number) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleAspectRatioChange = (aspectRatio: AspectRatio) => {
        setSettings(prev => ({ ...prev, aspectRatio }));
    };

    const handleTemplateChange = (template: Template) => {
        setSettings(prev => ({ ...prev, template, ...TEMPLATE_PRESETS[template] }));
    };

     useEffect(() => {
        if (audioRef.current) {
            if (isPlaying) {
                const { clipIndex, timeInClip, clip } = currentPlaybackData;
                if (clip?.audio) {
                    // This logic is tricky with multiple files. Simple play/pause for now.
                    // A more robust solution involves Web Audio API to stitch clips.
                    // For now, let's just control the first audio for simplicity.
                    const firstAudioClip = clips.find(c => c.audio);
                     if (firstAudioClip && firstAudioClip.audio) {
                        const audio = audioRef.current;
                        audio.src = firstAudioClip.audio.objectUrl;
                        audio.currentTime = playbackTime;
                        audio.play().catch(e => console.error("Audio play failed:", e));
                    }
                }
            } else {
                audioRef.current.pause();
            }
        }
    }, [isPlaying, currentPlaybackData, clips, playbackTime]);
    
    // --- Video Rendering ---
    const handleRender = async () => {
        if (isRendering) return;
        setIsRendering(true);
        setGeneratedVideoUrl(null);
        setRenderProgress(0);
        setRenderMessage("Initializing renderer...");

        if (typeof (window as any).VideoEncoder === 'undefined') {
            alert("Your browser does not support the VideoEncoder API. Please try Chrome or Edge.");
            setIsRendering(false);
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = RENDER_WIDTH;
        canvas.height = RENDER_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            alert("Could not create canvas context.");
            setIsRendering(false);
            return;
        }

        let muxer: Muxer<ArrayBufferTarget> | null = null;
        let videoEncoder: any | null = null;
        let audioEncoder: any | null = null;
        // FIX: Changed AudioDecoder to `any` to avoid compilation errors, as it's an experimental API.
        let audioDecoder: any | null = null;

        try {
            muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width: RENDER_WIDTH,
                    height: RENDER_HEIGHT,
                    frameRate: FPS,
                },
                audio: {
                    codec: 'aac',
                    sampleRate: 44100,
                    numberOfChannels: 1,
                },
                fastStart: 'in-memory',
            });

            videoEncoder = new window.VideoEncoder({
                output: (chunk: any, meta: any) => muxer?.addVideoChunk(chunk, meta),
                error: (e: any) => console.error("VideoEncoder error", e),
            });
            videoEncoder.configure({
                codec: 'avc1.4d002a',
                width: RENDER_WIDTH,
                height: RENDER_HEIGHT,
                bitrate: 8_000_000,
            });

            const audioTracks = clips.map(c => c.audio).filter(Boolean) as MediaFile[];
            if (audioTracks.length > 0) {
                 audioEncoder = new window.AudioEncoder({
                    output: (chunk: any, meta: any) => muxer?.addAudioChunk(chunk, meta),
                    error: (e: any) => console.error("AudioEncoder error", e),
                });
                audioEncoder.configure({
                    codec: 'mp4a.40.2',
                    sampleRate: 44100,
                    numberOfChannels: 1,
                    bitrate: 128000,
                });
            }

            let totalFrames = Math.ceil(totalDuration * FPS);
            let frameCount = 0;
            
            // --- Audio Encoding Pass ---
            if (audioTracks.length > 0 && audioEncoder) {
                setRenderMessage("Encoding audio...");
                const audioContext = new AudioContext({ sampleRate: 44100 });
                let currentTimestamp = 0;

                for (const audioFile of audioTracks) {
                    const arrayBuffer = await audioFile.file.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    const offlineContext = new OfflineAudioContext(
                        audioBuffer.numberOfChannels, 
                        audioBuffer.duration * 44100, 
                        44100
                    );
                    const source = offlineContext.createBufferSource();
                    source.buffer = audioBuffer;
                    
                    // Resample to mono if needed
                    if(audioBuffer.numberOfChannels > 1) {
                        const merger = offlineContext.createChannelMerger(1);
                        source.connect(merger);
                        merger.connect(offlineContext.destination);
                    } else {
                        source.connect(offlineContext.destination);
                    }

                    source.start(0);
                    const resampledBuffer = await offlineContext.startRendering();

                    const pcmData = resampledBuffer.getChannelData(0);
                    const audioData = new window.AudioData({
                        format: 'f32-planar',
                        sampleRate: 44100,
                        numberOfFrames: resampledBuffer.length,
                        numberOfChannels: 1,
                        timestamp: currentTimestamp,
                        data: pcmData,
                    });
                    
                    audioEncoder.encode(audioData);
                    currentTimestamp += resampledBuffer.duration * 1_000_000; // microseconds
                }
                await audioEncoder.flush();
            }


            // --- Video Encoding Pass ---
            setRenderMessage("Rendering video frames...");
            let currentTime = 0;
            for (let i = 0; i < totalFrames; i++) {
                currentTime = i / FPS;
                drawFrame(ctx, currentTime);

                const frame = new VideoFrame(canvas, { timestamp: (i * 1_000_000) / FPS });
                videoEncoder.encode(frame);
                frame.close();

                setRenderProgress((i / totalFrames) * 100);
            }
            
            await videoEncoder.flush();
            muxer.finalize();
            
            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: 'video/mp4' });
            setGeneratedVideoUrl(URL.createObjectURL(blob));
            setRenderMessage("Done!");
            setRenderProgress(100);

        } catch (e) {
            console.error("Rendering failed:", e);
            setRenderMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsRendering(false);
        }
    };
    
    return (
        <main className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr_380px] overflow-hidden">
            {/* Left Panel: Media Bins */}
            <div className="bg-panel-light border-r border-border-light p-3 flex flex-col gap-4 overflow-y-auto">
                <div>
                    <h2 className="font-bold mb-2">Image Bin ({images.length})</h2>
                    <FileUploadZone onDrop={(f) => handleFileDrop(f, 'image')} accept={{ 'image/*': [] }} title="Upload Images" />
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                        {images.map(img => (
                            <div key={img.id} 
                                className={`flex items-center gap-2 p-1 rounded cursor-pointer ${selectedStagedImageId === img.id ? 'bg-blue-100 ring-1 ring-brand-blue' : 'hover:bg-item-hover'}`}
                                onClick={() => setSelectedStagedImageId(img.id)}
                                onDoubleClick={() => setSelectedStagedImageId(null)}
                            >
                                <img src={img.objectUrl} className="w-8 h-8 object-cover rounded" />
                                <span className="text-xs truncate flex-1">{img.file.name}</span>
                                {selectedStagedImageId === img.id && selectedClipId && (
                                    <span className="text-xs text-blue-600 animate-pulse">Enter to assign | Dbl-click to deselect</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="border-t border-border-light pt-3">
                     <h2 className="font-bold mb-2">Audio Bin ({audios.length})</h2>
                     <FileUploadZone onDrop={(f) => handleFileDrop(f, 'audio')} accept={{ 'audio/*': [] }} title="Upload Audio"/>
                     <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                        {audios.map(aud => (
                             <div key={aud.id} className="flex items-center gap-2 p-1 rounded hover:bg-item-hover">
                                <AudioIcon className="w-5 h-5 text-text-secondary" />
                                <span className="text-xs truncate flex-1">{aud.file.name}</span>
                                <span className="text-xs text-text-secondary">{aud.duration?.toFixed(2) ?? '...'}s</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Center Panel: Preview and Timeline */}
            <div className="flex flex-col bg-bg-light p-4 overflow-hidden">
                {/* Preview */}
                <div className={`w-full max-w-[360px] mx-auto bg-panel-light rounded-lg shadow-inner overflow-hidden ${aspectRatioClasses[settings.aspectRatio]}`}>
                    <canvas ref={previewCanvasRef} className="w-full h-full"></canvas>
                    <audio ref={audioRef} />
                </div>

                {/* Playback Controls */}
                <div className="w-full max-w-sm mx-auto mt-3">
                    <div className="flex items-center gap-2">
                        <button onClick={handlePlayPause} className="p-2 bg-panel-light rounded-full shadow-sm hover:bg-item-hover">
                            {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                        </button>
                        <div className="flex-1 relative h-2 bg-gray-300 rounded-full">
                            <div className="absolute top-0 left-0 h-full bg-brand-blue rounded-full" style={{ width: `${(playbackTime / totalDuration) * 100}%` }}></div>
                             <input
                                type="range"
                                min="0"
                                max={totalDuration || 1}
                                step="0.01"
                                value={playbackTime}
                                onChange={e => setPlaybackTime(parseFloat(e.target.value))}
                                className="absolute w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                        <span className="text-xs font-mono w-24 text-right">{playbackTime.toFixed(2)}s / {totalDuration.toFixed(2)}s</span>
                    </div>
                </div>

                {/* Timeline */}
                <div className="flex-1 mt-4 overflow-y-auto pr-2 min-h-[30vh]">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="font-bold">Timeline ({clips.length} clips)</h2>
                        <button 
                            onClick={handleAddEmptyClip}
                            className="flex items-center gap-1 text-sm bg-white border border-gray-300 px-3 py-1 rounded-md hover:bg-gray-50"
                        >
                            <PlusCircleIcon className="w-4 h-4" /> Add Clip
                        </button>
                    </div>
                    <div className="space-y-2">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={clips} strategy={verticalListSortingStrategy}>
                                {clips.map(clip => (
                                    <SortableClip 
                                        key={clip.id} 
                                        clip={clip} 
                                        isSelected={clip.id === selectedClipId}
                                        onClick={() => handleTimelineClipClick(clip.id)}
                                        onDelete={() => handleDeleteClip(clip.id)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            </div>

            {/* Right Panel: Inspector */}
            <div className="bg-panel-light border-l border-border-light p-4 flex flex-col gap-4 overflow-y-auto">
                <div>
                    <h2 className="font-bold mb-2">Project Controls</h2>
                    <div className="flex flex-col gap-2">
                        <button onClick={() => setIsPreviewOpen(true)} className="w-full text-center bg-gray-600 text-white font-bold py-2 rounded-md hover:opacity-90 disabled:opacity-50" disabled={clips.length === 0}>
                            Fullscreen Preview
                        </button>
                         <button onClick={() => setIsSettingsModalOpen(true)} className="w-full text-center bg-gray-200 text-gray-800 font-bold py-2 rounded-md hover:bg-gray-300">
                           Project Settings
                        </button>

                         {isRendering ? (
                            <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden relative flex items-center justify-center mt-1">
                                <div className="bg-brand-blue h-full absolute left-0 top-0 transition-width duration-300" style={{ width: `${renderProgress}%` }}></div>
                                <span className="relative z-10 text-white font-bold text-xs px-2">{renderMessage}</span>
                            </div>
                        ) : (
                            <button onClick={handleRender} disabled={clips.length === 0} className="w-full bg-brand-green text-white font-bold py-2 rounded-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center">
                                <DownloadIcon className="w-5 h-5 mr-2" />
                                {generatedVideoUrl ? 'Re-render Video' : 'Render Video'}
                            </button>
                        )}
                        {generatedVideoUrl && !isRendering && (
                           <a href={generatedVideoUrl} download="ai-short.mp4" className="w-full bg-brand-blue text-white font-bold py-2 rounded-md hover:opacity-90 text-center flex items-center justify-center">
                                <DownloadIcon className="w-5 h-5 mr-2" />
                                Download Video
                           </a>
                        )}
                    </div>
                </div>
                
                {/* Clip Inspector */}
                {selectedClip ? (
                    <div className="border-t border-border-light pt-4 flex-1 flex flex-col gap-3">
                        <h2 className="font-bold -mt-1">Clip Inspector</h2>

                        <div>
                            <label className="text-xs font-semibold text-text-secondary">Subtitle Text</label>
                            <textarea
                                value={selectedClip.subtitle || ''}
                                onChange={(e) => handleClipSubtitleChange(selectedClip.id, e.target.value)}
                                rows={3}
                                className="w-full p-1.5 border rounded-md mt-1 text-sm"
                                placeholder="Enter subtitle for this clip"
                            ></textarea>
                        </div>
                        
                        <div>
                           <label className="text-xs font-semibold text-text-secondary">Background</label>
                           <div className="flex items-center gap-2 mt-1">
                                <button onClick={() => handleClipBackgroundTypeChange(selectedClip.id, 'image')} className={`px-3 py-1 text-xs rounded-full ${selectedClip.backgroundType === 'image' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>Image</button>
                                <button onClick={() => handleClipBackgroundTypeChange(selectedClip.id, 'color')} className={`px-3 py-1 text-xs rounded-full ${selectedClip.backgroundType === 'color' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>Color</button>
                                {selectedClip.backgroundType === 'color' && (
                                    <input type="color" value={selectedClip.backgroundColor} onChange={e => handleClipBackgroundColorChange(selectedClip.id, e.target.value)} className="w-8 h-8 p-0 border-none rounded-md" />
                                )}
                           </div>
                        </div>

                        {selectedClip.backgroundType === 'image' && (
                             <div>
                                <label className="text-xs font-semibold text-text-secondary">Assigned Image</label>
                                <select 
                                    value={selectedClip.image?.id || ''} 
                                    onChange={(e) => handleClipImageChange(selectedClip.id, e.target.value)}
                                    className="w-full p-2 border rounded mt-1 text-sm bg-white"
                                >
                                    <option value="">-- Select Image --</option>
                                    {images.map(img => <option key={img.id} value={img.id}>{img.file.name}</option>)}
                                </select>
                            </div>
                        )}
                       
                        <div>
                            <label className="text-xs font-semibold text-text-secondary">Assigned Audio</label>
                             <select 
                                value={selectedClip.audio?.id || ''} 
                                onChange={(e) => handleClipAudioChange(selectedClip.id, e.target.value)}
                                className="w-full p-2 border rounded mt-1 text-sm bg-white"
                            >
                                <option value="">-- Select Audio --</option>
                                {audios.map(aud => <option key={aud.id} value={aud.id}>{aud.file.name}</option>)}
                            </select>
                        </div>
                    </div>
                ) : (
                     <div className="text-center text-sm text-text-secondary mt-10">
                        <p>Select a clip from the timeline to edit its properties.</p>
                    </div>
                )}
            </div>

            {/* Modals */}
            <PreviewPlayer clips={clips} settings={settings} isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} />
            <SettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                settings={settings}
                onStringChange={handleStringSettingsChange}
                onNumberChange={handleNumericSettingsChange}
                onAspectRatioChange={handleAspectRatioChange}
                onTemplateChange={handleTemplateChange}
            />
        </main>
    );
}
