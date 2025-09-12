import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Short, YouTubeVideoDetails } from '../../types/youtube-shorts-content-factory/types'; // Adjusted to import type
import youtubeService from '../../services/youtubeService';
import { ShortStatus } from '../../types/youtube-shorts-content-factory/types'; // ShortStatus is an enum, so regular import
import { Button } from './common/Button';
import { Input } from './common/Input';
import { TextArea } from './common/TextArea';
import docsService from '../../services/docsService'; // Import docsService

// Removed import for generateScriptFromIdea

interface ShortDetailModalProps {
  short: Short | null;
  onClose: () => void;
  onSave: (updatedShort: Short) => void;
  projectDriveDocumentId?: string; // New prop
}

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return "00:00";
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const min = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const sec = (totalSeconds % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

export const ShortDetailModal: React.FC<ShortDetailModalProps> = ({ short, onClose, onSave, projectDriveDocumentId }) => {
  const [editableShort, setEditableShort] = useState<Short | null>(null);
  const navigate = useNavigate();
  const [newlyAddedImageFiles, setNewlyAddedImageFiles] = useState<File[]>([]);
  const loadedBlobUrlsRef = useRef<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(false); // New loading state
  const [videoDetails, setVideoDetails] = useState<YouTubeVideoDetails | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const loadImagesAndSetShort = async () => {
      setIsLoading(true); // Start loading for modal content
      if (short) {
        const shortCopy = JSON.parse(JSON.stringify(short));
        const imagesToLoad: string[] = [];
        const currentLoadedBlobUrls: string[] = []; // To store blob URLs created in this run

        // If projectDriveDocumentId exists, try to load short content from Google Doc
        if (projectDriveDocumentId && short.id) {
          try {
            const docShortContent = await docsService.getShortContentFromDoc(projectDriveDocumentId, short.id);
            // Merge doc content with existing short data, prioritizing doc content
            Object.assign(shortCopy, docShortContent);
            console.log('Loaded short content from Google Doc:', docShortContent);
          } catch (error) {
            console.error('Failed to load short content from Google Doc:', error);
            // Continue with local short data if doc loading fails
          }
        }

        // Identify images that are not blob URLs (i.e., permanent URLs from backend)
        if (shortCopy.images) {
          for (const imageUrl of shortCopy.images) {
            if (!imageUrl.startsWith('blob:')) {
              imagesToLoad.push(imageUrl);
            } else {
              // Keep existing blob URLs if they are already there (e.g., from a previous unsaved edit)
              // These are not created by this useEffect, so don't add to currentLoadedBlobUrls
              currentLoadedBlobUrls.push(imageUrl);
            }
          }
        }

        // Fetch images from backend and create blob URLs
        for (const imageUrl of imagesToLoad) {
          try {
            const response = await fetch(imageUrl); // Assuming direct fetch of image URL
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            const newBlobUrl = URL.createObjectURL(blob);
            currentLoadedBlobUrls.push(newBlobUrl);
            loadedBlobUrlsRef.current.push(newBlobUrl); // Store for cleanup
          } catch (error) {
            console.error(`Failed to load image from ${imageUrl}:`, error);
            // Optionally, push a placeholder or skip this image
            currentLoadedBlobUrls.push('/placeholder-image.png'); // Example placeholder
          }
        }
        shortCopy.images = currentLoadedBlobUrls;
        setEditableShort(shortCopy);
        console.log('Initial editableShort.youtubeUrl:', shortCopy.youtubeUrl);
        // If projectDriveDocumentId exists, assume this short's doc is the project doc
        if (projectDriveDocumentId) {
          shortCopy.googleDocId = projectDriveDocumentId;
        }
      } else {
        setEditableShort(null);
      }
      setIsLoading(false); // End loading for modal content
    };

    loadImagesAndSetShort();

    // Cleanup: Revoke blob URLs created by this useEffect run
    return () => {
      loadedBlobUrlsRef.current.forEach(url => {
        console.log(`[ShortDetailModal] Revoking blob URL: ${url}`);
        URL.revokeObjectURL(url);
      });
      loadedBlobUrlsRef.current = []; // Clear the ref for the next run
    };
  }, [short, projectDriveDocumentId]); // Add projectDriveDocumentId to dependencies

  if (!editableShort || isLoading) return <div className="p-4 text-center text-gray-600">Loading short details...</div>;

  const handleInputChange = (field: keyof Short, value: any) => {
    if (field === 'youtubeUrl') {
      console.log('youtubeUrl changed to:', value);
    }
    setEditableShort(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleFetchVideoData = async () => {
    if (!editableShort?.youtubeUrl) {
      setFetchError('YouTube URL을 입력해주세요.'); // Set error if URL is empty
      return;
    }
    console.log('Fetching video details for URL:', editableShort.youtubeUrl);
    setIsFetching(true);
    setVideoDetails(null);
    setFetchError(null); // Clear previous errors
    try {
      const result = await youtubeService.fetchVideoDetails(editableShort.youtubeUrl);
      setVideoDetails(result);
      // Update editableShort with fetched YouTube data
      setEditableShort(prev => prev ? {
        ...prev,
        titleLine1: result.title || '',
        titleLine2: result.channelTitle || '',
        youtubeViewCount: result.viewCount || '',
        youtubeLikeCount: result.likeCount || '',
        youtubeCommentCount: result.commentCount || '',
        youtubeDuration: result.duration || '',
      } : null);
    } catch (error: any) { // Use 'any' for error type to access message
      console.error('Error fetching video data:', error);
      setFetchError(error.response?.data || '영상 데이터 조회에 실패했습니다.'); // Display error from backend or generic message
    } finally {
      setIsFetching(false);
    }
  };
  
  const handleScriptChange = (field: 'idea' | 'draft' | 'hook' | 'immersion' | 'body' | 'cta', value: string) => {
    setEditableShort(prev => prev ? { ...prev, script: { ...prev.script, [field]: value } } : null);
  };

  const handleMetadataChange = (field: keyof Short['metadata'], value: string) => {
    setEditableShort(prev => prev ? { ...prev, metadata: { ...prev.metadata, [field]: value } } : null);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      const newImageUrls: string[] = [];
      const newFiles: File[] = [];
      for (const file of files) {
        const objectUrl = URL.createObjectURL(file);
        newImageUrls.push(objectUrl);
        newFiles.push(file);
      }
      setEditableShort(prev => {
        const updatedShort = prev ? { ...prev, images: [...(prev.images || []), ...newImageUrls] } : null;
        return updatedShort;
      });
      setNewlyAddedImageFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setEditableShort(prev => {
      const updatedShort = prev ? { ...prev, images: (prev.images || []).filter((_, index) => index !== indexToRemove) } : null;
      return updatedShort;
    });
  };

  const handleSaveChanges = async () => {
    setIsLoading(true); // Start loading for save changes
    try {
      // If final script has content, mark as revised
      if((editableShort.script.hook ?? '').trim() !== '' || (editableShort.script.immersion ?? '').trim() !== '' || (editableShort.script.body ?? '').trim() !== '' || (editableShort.script.cta ?? '').trim() !== '') {
          editableShort.status = ShortStatus.REVISED;
      }

      let finalImages = [...(editableShort.images || [])];

      if (newlyAddedImageFiles.length > 0) {
        const formData = new FormData();
        newlyAddedImageFiles.forEach(file => {
          formData.append('images', file); // Use 'images' as the field name for multiple files
        });

        console.log('--- Uploading Images (handleSaveChanges) ---');
        for (let [key, value] of formData.entries()) {
          console.log(`FormData Entry: ${key}`, value);
        }

        try {
          const response = await fetch('/api/upload/multiple-images', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const uploadedImageUrls: string[] = await response.json(); // Assuming backend returns an array of URLs

          // Replace blob URLs with permanent URLs
          let blobUrlIndex = 0;
          finalImages = finalImages.map(imageUrl => {
            if (imageUrl.startsWith('blob:')) {
              // This assumes the order of blob URLs in editableShort.images matches the order of newlyAddedImageFiles
              // and thus the order of uploadedImageUrls. This is a simplification.
              const permanentUrl = uploadedImageUrls[blobUrlIndex];
              blobUrlIndex++;
              return permanentUrl;
            }
            return imageUrl;
          });

          setNewlyAddedImageFiles([]); // Clear newly added files after successful upload

        } catch (error) {
          console.error('Error uploading new images:', error);
          alert('Failed to upload new images. Please try again.');
          return; // Stop the save process if image upload fails
        }
      }

      onSave({ ...editableShort, images: finalImages });

      // Update Google Doc if project has a linked document
      if (projectDriveDocumentId && editableShort.id) {
        try {
          await docsService.updateShortContentInDoc(projectDriveDocumentId, editableShort.id, { ...editableShort, images: finalImages });
          console.log('Short updated in Google Doc successfully!');
        } catch (error) {
          console.error('Failed to update short in Google Doc:', error);
          alert('Failed to update short in Google Doc. Check console for details.');
        }
      }
    } catch (error) {
        console.error('Error saving changes:', error);
        alert('Failed to save changes. Check console for details.');
    } finally {
        setIsLoading(false); // End loading for save changes
    }
  };

  const handleCreateShort = async () => { // Make it async
    navigate('/ai-shorts-generator', {
      state: {
        initialScript: editableShort.script,
        initialImages: editableShort.images || [], // Pass the processed images
        initialTitleLine1: editableShort.titleLine1 || '',
        initialTitleLine2: editableShort.titleLine2 || ''
      }
    });
    onClose();
  };

  

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Edit Short</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl leading-none">&times;</button>
          </div>
          
          <div className="space-y-6">
            <Input label="Title" id="title" value={editableShort.title || ''} onChange={e => handleInputChange('title', e.target.value)} />
            <Input label="Shorts Title Line 1" id="titleLine1" value={editableShort.titleLine1 || ''} onChange={e => handleInputChange('titleLine1', e.target.value)} />
            <Input label="Shorts Title Line 2" id="titleLine2" value={editableShort.titleLine2 || ''} onChange={e => handleInputChange('titleLine2', e.target.value)} />

            {/* YouTube Data Fetch Section */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold mb-2 text-blue-800">YouTube 영상 데이터 조회</h3>
              <div className="flex items-center gap-2">
                <Input
                  label="YouTube 영상 URL"
                  id="youtubeUrl"
                  value={editableShort.youtubeUrl || ''}
                  onChange={e => handleInputChange('youtubeUrl', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-grow"
                />
                {fetchError && <p className="text-red-500 text-sm mt-1">{fetchError}</p>}
                <Button onClick={handleFetchVideoData} disabled={isFetching || !editableShort.youtubeUrl}>
                  {isFetching ? '조회 중...' : '데이터 조회'}
                </Button>
              </div>
              {videoDetails && (
                <div className="mt-4 p-4 bg-white rounded-lg border">
                  <div className="flex flex-col md:flex-row gap-4">
                    <img src={videoDetails.thumbnailUrl} alt="Video thumbnail" className="w-full md:w-48 rounded-md object-cover" />
                    <div className="text-sm flex-grow">
                      <p className="font-bold text-base text-gray-800">{videoDetails.title}</p>
                      <p className="text-gray-600 mt-1">채널: {videoDetails.channelTitle}</p>
                      <p className="text-gray-600">게시일: {new Date(videoDetails.publishedAt).toLocaleDateString()}</p>
                      <div className="mt-2 pt-2 border-t grid grid-cols-2 gap-x-4 gap-y-1">
                        <p><strong>조회수:</strong> {Number(videoDetails.viewCount).toLocaleString()}</p>
                        <p><strong>좋아요:</strong> {Number(videoDetails.likeCount).toLocaleString()}</p>
                        <p><strong>댓글:</strong> {Number(videoDetails.commentCount).toLocaleString()}</p>
                        <p><strong>영상 길이:</strong> {formatDuration(videoDetails.duration)}</p>
                      </div>
                    </div>
                  </div>
                  {videoDetails.tags?.length > 0 && (
                      <div className="mt-3 pt-2 border-t">
                          <p className="font-semibold text-sm">태그:</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                              {videoDetails.tags.map(tag => <span key={tag} className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs">{tag}</span>)}
                          </div>
                      </div>
                  )}
                </div>
              )}
            </div>

            {/* Script Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TextArea label="Idea" id="idea" value={editableShort.script.idea || ''} onChange={e => handleScriptChange('idea', e.target.value)} placeholder="A core concept or question..."/>
                <TextArea className="md:col-span-1" label="Draft Script" id="draft" value={editableShort.script.draft || ''} onChange={e => handleScriptChange('draft', e.target.value)} />
                {/* New Script Fields */}
                <div className="md:col-span-1 bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">Final Script (TTS 대본)</h3>
                    <div className="space-y-4">
                        <TextArea label="Hook" id="hook" value={editableShort.script.hook || ''} onChange={e => handleScriptChange('hook', e.target.value)} placeholder="시작을 훅으로 끌어당기세요." />
                        <TextArea label="Immersion" id="immersion" value={editableShort.script.immersion || ''} onChange={e => handleScriptChange('immersion', e.target.value)} placeholder="시청자를 몰입시키는 내용을 작성하세요." />
                        <TextArea label="Body" id="body" value={editableShort.script.body || ''} onChange={e => handleScriptChange('body', e.target.value)} placeholder="본문 내용을 작성하세요." />
                        <TextArea label="CTA" id="cta" value={editableShort.script.cta || ''} onChange={e => handleScriptChange('cta', e.target.value)} placeholder="클릭을 유도하는 문구를 작성하세요." />
                    </div>
                </div>
            </div>

            

            {/* Image Section */}
            <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Short Image</h3>
                <div>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {(editableShort.images && editableShort.images.length > 0) ? (
                            editableShort.images.map((image, index) => (
                                <div key={index} className="relative w-24 h-24 border border-gray-300 rounded-lg overflow-hidden flex items-center justify-center">
                                    <img src={image} alt={`Short Preview ${index + 1}`} className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />
                                    <button onClick={() => handleRemoveImage(index)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs leading-none w-6 h-6 flex items-center justify-center">&times;</button>
                                </div>
                            ))
                        ) : (
                            <div className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500">
                                No Images Selected
                            </div>
                        )}
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">쇼츠 만들기</h3>
                <Button onClick={handleCreateShort} className="w-full mb-2">AI 쇼츠 생성기로 보내기</Button>
                <Button onClick={() => navigate(`/projects/${editableShort.projectId}/shorts/${editableShort.id}/report`)} className="w-full" variant="secondary">쇼츠 보고서 보기</Button>
            </div>

            {/* Metadata Section */}
            <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Metadata</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Tags (comma-separated)" id="tags" value={editableShort.metadata.tags || ''} onChange={e => handleMetadataChange('tags', e.target.value)} />
                    <Input label="Call to Action (CTA)" id="cta" value={editableShort.metadata.cta || ''} onChange={e => handleMetadataChange('cta', e.target.value)} />
                    <TextArea label="Image / B-Roll Ideas" id="imageIdeas" value={editableShort.metadata.imageIdeas || ''} onChange={e => handleMetadataChange('imageIdeas', e.target.value)} className="min-h-[80px]" />
                    <TextArea label="Audio / Music Notes" id="audioNotes" value={editableShort.metadata.audioNotes || ''} onChange={e => handleMetadataChange('audioNotes', e.target.value)} className="min-h-[80px]" />
                </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveChanges} disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};