import React, { useState, useEffect } from 'react';
import type { Project, Short } from '../../types/youtube-shorts-content-factory/types';
import { ShortStatus } from '../../types/youtube-shorts-content-factory/types';
import { Button } from './common/Button';
import { ShortCard } from './ShortCard';
import { ShortDetailModal } from './ShortDetailModal';
import { Input } from './common/Input';
import projectService from '../../services/youtube-shorts-content-factory/projectService'; // Import projectService

interface ProjectViewProps {
  project: Project;
  onBack: () => void;
  onUpdateProject: (updatedProject: Project) => void;
}

export const ProjectView: React.FC<ProjectViewProps> = ({ project, onBack, onUpdateProject }) => {
  const [selectedShort, setSelectedShort] = useState<Short | null>(null);
  const [newShortTitle, setNewShortTitle] = useState('');
  const [isAddingShort, setIsAddingShort] = useState(false);
  const [shorts, setShorts] = useState<Short[]>([]); // Local state for shorts

  // Fetch shorts when project changes
  useEffect(() => {
    const loadShorts = async () => {
      try {
        const fetchedShorts = await projectService.fetchShorts(project.id);
        setShorts(fetchedShorts);
      } catch (error) {
        console.error('Error fetching shorts:', error);
        alert('Failed to load shorts. Check console for details.');
      }
    };
    loadShorts();
  }, [project.id]);

  const handleSaveShort = async (updatedShort: Short) => {
    try {
      await projectService.saveShort(project.id, updatedShort);
      const fetchedShorts = await projectService.fetchShorts(project.id); // Re-fetch after save
      setShorts(fetchedShorts);
      setSelectedShort(null);
    } catch (error) {
      console.error('Error saving short:', error);
      alert('Failed to save short. Check console for details.');
    }
  };

  const handleDeleteShort = (shortId: string) => {
    if (!window.confirm('Are you sure you want to delete this short?')) {
      return;
    }
    const updatedShorts = project.shorts.filter(s => s.id !== shortId);
    onUpdateProject({ ...project, shorts: updatedShorts });
    setSelectedShort(null);
  };
  
  const handleAddNewShort = async () => {
    if (!newShortTitle.trim()) {
      alert("Please enter a title for the new short.");
      return;
    }

    setIsAddingShort(true);
    try {
      const newShort: Omit<Short, 'id'> = {
        projectId: project.id,
        title: newShortTitle.trim(),
        status: ShortStatus.IDEA,
        script: { idea: '', draft: '', hook: '', immersion: '', body: '', cta: '' },
        metadata: { tags: '', cta: '', imageIdeas: '', audioNotes: '' },
      };

      await projectService.saveShort(project.id, newShort);
      const fetchedShorts = await projectService.fetchShorts(project.id); // Re-fetch after add
      setShorts(fetchedShorts);
      setNewShortTitle('');
    } catch (error) {
      console.error('Error adding short:', error);
      alert('Failed to add short. Check console for details.');
    } finally {
      setIsAddingShort(false);
    }
  };

  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Title,Status,Tags,CTA,Final Script\n";

    shorts.forEach(short => {
      const row = [
        `"${short.title.replace(/"/g, '""')}"`,
        short.status,
        `"${short.metadata.tags.replace(/"/g, '""')}"`,
        `"${short.metadata.cta.replace(/"/g, '""')}"`,
        `"${short.script.hook.replace(/"/g, '""')}
${short.script.immersion.replace(/"/g, '""')}
${short.script.body.replace(/"/g, '""')}
${short.script.cta.replace(/"/g, '""')}"`
      ].join(",");
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${project.name.replace(/\s+/g, '_')}_shorts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <button onClick={onBack} className="text-indigo-500 hover:text-indigo-700 mb-2 font-medium">&larr; Back to Projects</button>
          <h2 className="text-3xl font-bold text-gray-900">{project.name}</h2>
          <p className="text-gray-600 mt-1">{project.description}</p>
          
        </div>
        <Button onClick={exportToCSV} variant="secondary">Export All to CSV</Button>
      </div>
      
      {/* Add New Short Section */}
      <div className="bg-gray-100 p-4 rounded-lg mb-8 border border-gray-200">
        <div className="flex items-center gap-4">
          <Input 
            placeholder="Enter title for new Short..." 
            value={newShortTitle}
            onChange={e => setNewShortTitle(e.target.value)}
            className="flex-grow"
            onKeyDown={(e) => e.key === 'Enter' && handleAddNewShort()}
            disabled={isAddingShort}
          />
          <Button onClick={handleAddNewShort} disabled={isAddingShort}>
            {isAddingShort ? 'Adding...' : 'Add Short'}
          </Button>
        </div>
      </div>
      
      {/* Shorts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shorts.map(short => (
          <ShortCard key={short.id} short={short} onClick={() => setSelectedShort(short)} onDelete={handleDeleteShort} />
        ))}
      </div>

      {selectedShort && (
        <ShortDetailModal 
          short={selectedShort} 
          onClose={() => setSelectedShort(null)} 
          onSave={handleSaveShort} 
          
        />
      )}
    </div>
  );
};