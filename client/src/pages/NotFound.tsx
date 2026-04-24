import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PRODUCT } from '../lib/branding';

export function NotFound() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
      <div className="text-center max-w-md">
        <p className="text-8xl font-bold text-teal-600 dark:text-teal-400 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('notFound.title', 'Page not found')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">{t('notFound.description', "The page you're looking for doesn't exist or has been moved.")}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors">
            {t('notFound.goToLeaderboard', 'Go to Leaderboard')}
          </button>
          <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
            {t('notFound.goBack', 'Go Back')}
          </button>
        </div>
        <div className="mt-10 text-xs text-gray-400 dark:text-gray-600">
          {PRODUCT.name} · {PRODUCT.vendor}
        </div>
      </div>
    </div>
  );
}
