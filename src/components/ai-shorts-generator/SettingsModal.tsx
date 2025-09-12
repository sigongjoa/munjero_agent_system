import React from 'react';
import type { ProjectSettings, AspectRatio, Template } from '../../types/ai-shorts-generator';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: ProjectSettings;
    onStringChange: (field: keyof ProjectSettings, value: string) => void;
    onNumberChange: (field: keyof ProjectSettings, value: string) => void;
    onAspectRatioChange: (value: AspectRatio) => void;
    onTemplateChange: (value: Template) => void;
}

const NumberInput = ({ label, value, field, onChange }: { label: string; value: number; field: keyof ProjectSettings; onChange: (field: keyof ProjectSettings, value: string) => void; }) => (
    <div>
        <label className="text-xs font-semibold text-text-secondary">{label}</label>
        <input type="number" value={value} onChange={e => onChange(field, e.target.value)} className="w-full p-1.5 border rounded mt-1 text-sm" />
    </div>
);

const StringInput = ({ label, value, field, onChange, isTextArea = false }: { label: string; value: string; field: keyof ProjectSettings; onChange: (field: keyof ProjectSettings, value: string) => void; isTextArea?: boolean }) => (
     <div>
        <label className="font-semibold">{label}</label>
        {isTextArea ? (
             <textarea value={value} onChange={e => onChange(field, e.target.value)} rows={2} className="w-full p-1 border rounded mt-1" />
        ) : (
            <input type="text" value={value} onChange={e => onChange(field, e.target.value)} className="w-full p-1.5 border rounded mt-1" />
        )}
    </div>
);


export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    settings,
    onStringChange,
    onNumberChange,
    onAspectRatioChange,
    onTemplateChange
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
            <div 
                className="bg-panel-light rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-border-light">
                    <h2 className="font-bold text-lg">Project Settings</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl font-bold">&times;</button>
                </div>
                
                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    <div className="flex flex-col gap-4 text-sm">
                        {/* Common Settings */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="font-semibold">Aspect Ratio</label>
                                <select value={settings.aspectRatio} onChange={e => onAspectRatioChange(e.target.value as AspectRatio)} className="w-full p-1.5 border rounded mt-1">
                                    <option value="9:16">9:16 (Vertical)</option>
                                    <option value="1:1">1:1 (Square)</option>
                                    <option value="16:9">16:9 (Horizontal)</option>
                                </select>
                            </div>
                            <div>
                                <label className="font-semibold">Template</label>
                                <select value={settings.template} onChange={e => onTemplateChange(e.target.value as Template)} className="w-full p-1.5 border rounded mt-1">
                                    <option value="classic-dark">Classic Dark</option>
                                    <option value="mobi-light">Mobi Light</option>
                                    <option value="exam-korean">Exam Korean</option>
                                </select>
                            </div>
                        </div>

                        <hr className="border-border-light" />
                        
                        <h3 className="font-bold -mb-2">Template Settings</h3>

                        {/* Template-Specific Settings */}
                        {settings.template === 'classic-dark' && (
                            <div className="flex flex-col gap-3">
                                <StringInput label="Title Line 1" value={settings.titleLine1} field="titleLine1" onChange={onStringChange} isTextArea />
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberInput label="L1 Font Size" value={settings.titleLine1FontSize} field="titleLine1FontSize" onChange={onNumberChange} />
                                    <NumberInput label="L1 Stroke" value={settings.titleLine1StrokeSize} field="titleLine1StrokeSize" onChange={onNumberChange} />
                                </div>
                                <StringInput label="Title Line 2" value={settings.titleLine2} field="titleLine2" onChange={onStringChange} isTextArea />
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberInput label="L2 Font Size" value={settings.titleLine2FontSize} field="titleLine2FontSize" onChange={onNumberChange} />
                                    <NumberInput label="L2 Stroke" value={settings.titleLine2StrokeSize} field="titleLine2StrokeSize" onChange={onNumberChange} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberInput label="Subtitle Size" value={settings.subtitleFontSize} field="subtitleFontSize" onChange={onNumberChange} />
                                    <NumberInput label="Subtitle Stroke" value={settings.subtitleStrokeSize} field="subtitleStrokeSize" onChange={onNumberChange} />
                                </div>
                                <StringInput label="CTA Text" value={settings.ctaText} field="ctaText" onChange={onStringChange} />
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberInput label="CTA Font Size" value={settings.ctaFontSize} field="ctaFontSize" onChange={onNumberChange} />
                                    <NumberInput label="CTA Stroke" value={settings.ctaStrokeSize} field="ctaStrokeSize" onChange={onNumberChange} />
                                </div>
                                <div>
                                    <label className="font-semibold">Layout Guidelines</label>
                                    <div className="grid grid-cols-3 gap-2 mt-1">
                                        <NumberInput label="Top (%)" value={settings.topGuideline} field="topGuideline" onChange={onNumberChange} />
                                        <NumberInput label="Bottom (Subtitle Y Position %)" value={settings.bottomGuideline} field="bottomGuideline" onChange={onNumberChange} />
                                        <NumberInput label="CTA (%)" value={settings.ctaGuideline} field="ctaGuideline" onChange={onNumberChange} />
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {settings.template === 'mobi-light' && (
                            <div className="flex flex-col gap-3">
                                <StringInput label="Header Search Text" value={settings.titleLine1} field="titleLine1" onChange={onStringChange} />
                                <NumberInput label="Header Font Size" value={settings.titleLine1FontSize} field="titleLine1FontSize" onChange={onNumberChange} />

                                <StringInput label="Main Title" value={settings.titleLine2} field="titleLine2" onChange={onStringChange} isTextArea />
                                <NumberInput label="Main Title Font Size" value={settings.titleLine2FontSize} field="titleLine2FontSize" onChange={onNumberChange} />
                                
                                <StringInput label="Meta Text" value={settings.ctaText} field="ctaText" onChange={onStringChange} />
                                <NumberInput label="Meta Text Font Size" value={settings.ctaFontSize} field="ctaFontSize" onChange={onNumberChange} />

                                <NumberInput label="Subtitle Font Size" value={settings.subtitleFontSize} field="subtitleFontSize" onChange={onNumberChange} />
                            </div>
                        )}

                        {settings.template === 'exam-korean' && (
                             <div className="flex flex-col gap-3">
                                <StringInput label="Main Title Line 1" value={settings.examTitle} field="examTitle" onChange={onStringChange} isTextArea />
                                <NumberInput label="L1 Font Size" value={settings.examTitleFontSize} field="examTitleFontSize" onChange={onNumberChange} />
                                
                                <StringInput label="Main Title Line 2" value={settings.examTitleLine2} field="examTitleLine2" onChange={onStringChange} isTextArea />
                                <NumberInput label="L2 Font Size" value={settings.examTitleLine2FontSize} field="examTitleLine2FontSize" onChange={onNumberChange} />

                                <hr className="border-border-light" />

                                <div className="grid grid-cols-2 gap-4">
                                    <StringInput label="Name (성명)" value={settings.examName} field="examName" onChange={onStringChange} />
                                    <StringInput label="Subject (과목명)" value={settings.examSubject} field="examSubject" onChange={onStringChange} />
                                </div>
                                <NumberInput label="Info Font Size" value={settings.examInfoFontSize} field="examInfoFontSize" onChange={onNumberChange} />

                                <hr className="border-border-light" />
                                <p className="text-xs text-text-secondary -mt-2">The subtitle text is edited in the 'Clip Inspector' for each clip.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberInput label="Subtitle Font Size" value={settings.subtitleFontSize} field="subtitleFontSize" onChange={onNumberChange} />
                                    <NumberInput label="Subtitle Stroke" value={settings.subtitleStrokeSize} field="subtitleStrokeSize" onChange={onNumberChange} />
                                </div>
                             </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-bg-light border-t border-border-light flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="bg-brand-blue text-white font-bold py-2 px-6 rounded-md hover:opacity-90"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};