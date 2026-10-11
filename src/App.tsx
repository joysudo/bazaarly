import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TopNav } from './components/layout/TopNav';
import { EventsPage } from './pages/EventsPage';
import { InventoryPage } from './pages/InventoryPage';
import { KioskPage } from './pages/KioskPage';
import { LandingPage } from './pages/LandingPage';
import type { BazaarlyEvent } from './lib/types';

type View = 'events' | 'inventory' | 'kiosk';

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>('events');
  const [selectedEvent, setSelectedEvent] = useState<BazaarlyEvent | null>(null);

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.35 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!user) return <LandingPage />;

  if (view === 'kiosk') {
    return <KioskPage onExit={() => { setSelectedEvent(null); setView('events'); }} />;
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <TopNav
        activeTab={view}
        onTabChange={tab => { setView(tab); setSelectedEvent(null); }}
        user={user}
      />
      {view === 'events' ? (
        <EventsPage
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
          onCloseDashboard={() => setSelectedEvent(null)}
        />
      ) : <InventoryPage />}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
