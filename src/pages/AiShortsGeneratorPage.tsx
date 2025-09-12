import React from 'react';
import { useLocation } from 'react-router-dom';
import { ClassicEditor } from '../components/ai-shorts-generator/ClassicEditor';
import type { InitialShortData } from '../types/ai-shorts-generator';

const AiShortsGeneratorPage: React.FC = () => {
    const location = useLocation();
    
    // Data sent from ShortDetailModal
    const { initialScript, initialImages } = location.state || {};

    // Adapt the data to the format expected by ClassicEditor
    const initialShortData: InitialShortData | undefined = 
        (initialScript && initialImages) 
        ? { script: initialScript, images: initialImages } 
        : undefined;

    return (
        <div className="flex flex-col h-screen bg-bg-light text-text-primary font-sans">
            <header className="flex-shrink-0 bg-panel-light border-b border-border-light px-4 h-16 flex items-center justify-between z-10 shadow-sm">
                <div className="flex items-baseline gap-4">
                    <h1 className="text-lg font-bold">AI Shorts Generator</h1>
                </div>
            </header>
            <ClassicEditor initialShortData={initialShortData} />
        </div>
    );
};

export default AiShortsGeneratorPage;
