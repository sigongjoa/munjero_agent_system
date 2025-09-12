import type { ParsedTextPart, Template, ProjectSettings } from '../../types/ai-shorts-generator.js';

export const RENDER_DIMENSIONS = {
    '1:1': { width: 1080, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '16:9': { width: 1920, height: 1080 },
};
export const FPS = 30;
export const DEFAULT_CLIP_DURATION = 3;

export const aspectRatioClasses = {
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-[16/9]',
};

export const TEMPLATE_PRESETS = {
    'classic-dark': {
        titleLine1: '[color=#ffffff]맥주 전쟁[/color]',
        titleLine1FontSize: 110,
        titleLine1StrokeSize: 8,
        titleLine2: '[color=#ffff00]전쟁을 멈춘 두 리더?[/color]',
        titleLine2FontSize: 120,
        titleLine2StrokeSize: 8,
        subtitleFontSize: 64,
        subtitleStrokeSize: 6,
        ctaFontSize: 48,
        ctaStrokeSize: 4,
        ctaText: '',
        examTitle: '',
        examTitleFontSize: 0,
        examTitleLine2: '',
        examTitleLine2FontSize: 0,
        examName: '',
        examSubject: '',
        examInfoFontSize: 0,
    },
    'mobi-light': {
        titleLine1: '모비 GPT',
        titleLine1FontSize: 48,
        titleLine1StrokeSize: 0,
        titleLine2: '마비노기 마족공물/은동전 자동관리',
        titleLine2FontSize: 64,
        titleLine2StrokeSize: 0,
        subtitleFontSize: 52,
        subtitleStrokeSize: 0,
        ctaFontSize: 36,
        ctaStrokeSize: 0,
        ctaText: '당콜 | 18:10 | 조회 123,456',
        examTitle: '',
        examTitleFontSize: 0,
        examTitleLine2: '',
        examTitleLine2FontSize: 0,
        examName: '',
        examSubject: '',
        examInfoFontSize: 0,
    },
    'exam-korean': {
        titleLine1: '',
        titleLine1FontSize: 0,
        titleLine1StrokeSize: 0,
        titleLine2: '',
        titleLine2FontSize: 0,
        titleLine2StrokeSize: 0,
        subtitleFontSize: 64,
        subtitleStrokeSize: 6,
        ctaFontSize: 48,
        ctaStrokeSize: 0,
        ctaText: '자세한 내용은 본문을 참고하세요.',
        examTitle: '쩝쩝박사',
        examTitleFontSize: 140,
        examTitleLine2: '능력평가',
        examTitleLine2FontSize: 140,
        examName: '김쩝쩝',
        examSubject: '오늘도 한입만',
        examInfoFontSize: 48,
    }
};

export const createId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const parseColoredText = (text: string | undefined): ParsedTextPart[] => {
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

export const drawTextWithStroke = (ctx: CanvasRenderingContext2D, textParts: ParsedTextPart[], x: number, y: number, strokeSize: number) => {
    ctx.save();
    ctx.lineWidth = strokeSize;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let currentX = x;
    const totalWidth = textParts.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
    currentX -= totalWidth / 2;

    for (const part of textParts) {
        const partWidth = ctx.measureText(part.text).width;
        ctx.strokeText(part.text, currentX + partWidth / 2, y);
        ctx.fillStyle = part.color;
        ctx.fillText(part.text, currentX + partWidth / 2, y);
        currentX += partWidth;
    }
    ctx.restore();
};

export const drawStyledTextWithBackground = (ctx: CanvasRenderingContext2D, text: string | undefined, x: number, currentY: number, defaultOpacity: number, fontSize: number, strokeSize: number): number => {
    if (!text) return currentY;

    let backgroundOpacity = defaultOpacity;
    let processedText = text;

    const bgOpacityRegex = /\[bg_opacity=(\d+)\]([\s\S]*?)\[\/bg_opacity\]/i;
    const bgMatch = processedText.match(bgOpacityRegex);
    if (bgMatch) {
        backgroundOpacity = parseInt(bgMatch[1], 10);
        processedText = bgMatch[2];
    } else {
        processedText = processedText.replace(/\[\/?bg_opacity(?:=\d+)?\]/gi, '');
    }

    if (isNaN(backgroundOpacity) || backgroundOpacity < 0 || backgroundOpacity > 100) {
        backgroundOpacity = defaultOpacity;
    }

    const lines = processedText.split('\n');
    const parsedLines = lines.map(line => parseColoredText(line));
    const lineHeight = fontSize * 1.2;

    ctx.save();
    ctx.font = `bold ${fontSize}px "NanumSquare"`;
    ctx.textBaseline = 'middle';

    const lineMetrics = parsedLines.map(lineParts => {
        const width = lineParts.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
        return { width, parts: lineParts };
    });

    const maxWidth = Math.max(0, ...lineMetrics.map(m => m.width));
    const horizontalPadding = 24;
    const verticalPadding = 10;

    const boxWidth = maxWidth + horizontalPadding * 2;
    const boxHeight = (lines.length * lineHeight) + verticalPadding * 2;
    const boxY = currentY - boxHeight / 2;

    if (backgroundOpacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * (backgroundOpacity / 100)})`;
        ctx.roundRect(x - boxWidth / 2, boxY, boxWidth, boxHeight, 15);
        ctx.fill();
    }

    ctx.lineWidth = strokeSize;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'black';
    ctx.textAlign = 'left';

    const startTextY = currentY - (lines.length - 1) * lineHeight / 2;

    parsedLines.forEach((textParts, index) => {
        const lineY = startTextY + (index * lineHeight);
        const lineWidth = lineMetrics[index].width;
        
        let currentX = x - lineWidth / 2;

        for (const part of textParts) {
            ctx.strokeText(part.text, currentX, lineY);
            ctx.fillStyle = part.color;
            ctx.fillText(part.text, currentX, lineY);
            
            currentX += ctx.measureText(part.text).width;
        }
    });

    ctx.restore();
    return currentY;
};

export const drawMultilineText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize: number, lineHeight: number, color: string, align: 'center' | 'left' | 'right' = 'center', weight: 'normal' | 'bold' = 'bold') => {
    ctx.save();
    ctx.font = `${weight} ${fontSize}px "Noto Sans KR"`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    const lines = text.split('\n');
    const totalTextHeight = (lines.length - 1) * lineHeight;
    let currentY = y - totalTextHeight / 2;

    lines.forEach(line => {
        ctx.fillText(line.trim(), x, currentY);
        currentY += lineHeight;
    });

    ctx.restore();
};

export const naturalSort = (a: string, b: string): number => {
    const re = /(\d+)|(\D+)/g;
    const aArr = a.match(re) || [];
    const bArr = b.match(re) || [];

    for (let i = 0; i < Math.min(aArr.length, bArr.length); i++) {
        const aPart = aArr[i];
        const bPart = bArr[i];

        const aNum = parseInt(aPart, 10);
        const bNum = parseInt(bPart, 10);

        if (!isNaN(aNum) && !isNaN(bNum)) {
            if (aNum !== bNum) {
                return aNum - bNum;
            }
        } else {
            const cmp = aPart.localeCompare(bPart);
            if (cmp !== 0) {
                return cmp;
            }
        }
    }
    return aArr.length - bArr.length;
};

export const generateSubtitleFromFilename = (filename: string): string => {
    let subtitle = filename.replace(/\.[^/.]+$/, "");
    subtitle = subtitle.replace(/^audio_\d+_?/, '');
    subtitle = subtitle.replace(/_/g, " ");
    return subtitle.trim();
};

export const getDefaultSubtitleY = (template: Template, projectSettings: ProjectSettings) => {
    switch (template) {
        case 'classic-dark':
            return 100 - projectSettings.bottomGuideline;
        case 'mobi-light':
            return 100 - projectSettings.bottomGuideline; // Use global setting
        case 'exam-korean':
            return 100 - projectSettings.bottomGuideline; // Use global setting
        default:
            return 100 - projectSettings.bottomGuideline; // Use global setting
    }
};