import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import projectService from '../services/youtube-shorts-content-factory/projectService';
import { ReportData } from '../types/youtube-shorts-content-factory/types';
import Layout from '../components/Layout';

const ShortsReportPage: React.FC = () => {
  const { projectId, shortId } = useParams<{ projectId: string; shortId: string }>();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getReport = async () => {
      if (!projectId || !shortId) {
        setError('Project ID or Short ID is missing.');
        setLoading(false);
        return;
      }
      try {
        const data = await projectService.fetchShortsReport(projectId, shortId);
        setReportData(data);
      } catch (err) {
        console.error('Failed to fetch report data:', err);
        setError('Failed to load report. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    getReport();
  }, [projectId, shortId]);

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-screen">
          <p>Loading report...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-screen text-red-500">
          <p>{error}</p>
        </div>
      </Layout>
    );
  }

  if (!reportData) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-screen">
          <p>No report data available.</p>
        </div>
      </Layout>
    );
  }

  const handleDownloadPdf = () => {
    if (!projectId || !shortId) {
      alert('Project ID or Short ID is missing for PDF download.');
      return;
    }
    const pdfUrl = `/api/projects/${projectId}/shorts/${shortId}/report/pdf`;
    window.open(pdfUrl, '_blank');
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="mb-8">
          <div className="flex items-center text-sm text-gray-500 mb-4">
            <a className="hover:text-[var(--primary-color)]" href="#">Shorts</a>
            <span className="mx-2">/</span>
            <span className="font-medium text-gray-700">Short Report</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Short Report: "{reportData.title}"</h1>
          <p className="mt-2 text-lg text-gray-600">{reportData.description}</p>
          <button
            onClick={handleDownloadPdf}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Download PDF
          </button>
        </div>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Short Breakdown</h2>
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="w-28 flex-shrink-0">
                    <div
                      className="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md"
                      style={{ backgroundImage: `url("${reportData.breakdown.hook.imageUrl}")` }}
                    ></div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Hook (0-3s)</h3>
                    <p className="text-gray-600 mt-1">{reportData.breakdown.hook.description}</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-28 flex-shrink-0">
                    <div
                      className="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md"
                      style={{ backgroundImage: `url("${reportData.breakdown.immersion.imageUrl}")` }}
                    ></div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Immersion (4-15s)</h3>
                    <p className="text-gray-600 mt-1">{reportData.breakdown.immersion.description}</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-28 flex-shrink-0">
                    <div
                      className="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md"
                      style={{ backgroundImage: `url("${reportData.breakdown.body.imageUrl}")` }}
                    ></div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Body (16-25s)</h3>
                    <p className="text-gray-600 mt-1">{reportData.breakdown.body.description}</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-28 flex-shrink-0">
                    <div
                      className="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md"
                      style={{ backgroundImage: `url("${reportData.breakdown.cta.imageUrl}")` }}
                    ></div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">CTA (26-30s)</h3>
                    <p className="text-gray-600 mt-1">{reportData.breakdown.cta.description}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-l border-gray-200 pl-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Performance Summary</h2>
              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="material-symbols-outlined text-xl">visibility</span>
                    <p className="text-base font-medium">Views</p>
                  </div>
                  <p className="text-gray-900 text-4xl font-bold tracking-tight">{reportData.performance.views}</p>
                  <p className="text-sm text-gray-500">{reportData.performance.viewsChange} from last week</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="material-symbols-outlined text-xl">trending_down</span>
                    <p className="text-base font-medium">Bounce Rate</p>
                  </div>
                  <p className="text-gray-900 text-4xl font-bold tracking-tight">{reportData.performance.bounceRate}</p>
                  <p className="text-sm text-gray-500">{reportData.performance.bounceRateChange} from last week</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="material-symbols-outlined text-xl">thumb_up</span>
                    <p className="text-base font-medium">Likes</p>
                  </div>
                  <p className="text-gray-900 text-4xl font-bold tracking-tight">{reportData.performance.likes}</p>
                  <p className="text-sm text-gray-500">{reportData.performance.likesChange} from last week</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="material-symbols-outlined text-xl">comment</span>
                    <p className="text-base font-medium">Comments</p>
                  </div>
                  <p className="text-gray-900 text-4xl font-bold tracking-tight">{reportData.performance.comments}</p>
                  <p className="text-sm text-gray-500">{reportData.performance.commentsChange} from last week</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="material-symbols-outlined text-xl">share</span>
                    <p className="text-base font-medium">Shares</p>
                  </div>
                  <p className="text-gray-900 text-4xl font-bold tracking-tight">{reportData.performance.shares}</p>
                  <p className="text-sm text-gray-500">{reportData.performance.sharesChange} from last week</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ShortsReportPage;
