/**
 * Main App Screen — manual tab navigation.
 * Manages tab state, chat flow, and global sidebar drawer.
 */
import React, { useState, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { View, StyleSheet, useWindowDimensions } from 'react-native';


import { useLocation } from '@/hooks/useLocation';
import { BottomTabBar, TabName } from '@/components/BottomTabBar';
import { Sidebar } from '@/components/Sidebar';
import { IntentCaptureScreen } from '@/screens/IntentCapture';
import { ChatScreen } from '@/screens/Chat';
import { DiscoveryScreen } from '@/screens/Discovery';
import { ExecutionScreen } from '@/screens/Execution';
import { TrackingScreen } from '@/screens/Tracking';
import { SearchChatsModal } from '@/components/SearchChatsModal';

export default function AppScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<TabName>('request');
  const [showChat, setShowChat] = useState(false);
  const [initialChatMessage, setInitialChatMessage] = useState<string | undefined>(undefined);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSearchModalVisible, setSearchModalVisible] = useState(false);

  const userLocation = useLocation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const isSidebarOpen = isDesktop ? desktopOpen : mobileOpen;

  const openSidebar = useCallback(() => {
    setDesktopOpen(true);
    setMobileOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setDesktopOpen(false);
    setMobileOpen(false);
  }, []);

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
    if (tab !== 'request') {
      setShowChat(false);
    }
  }, []);

  const handleStartChat = useCallback((_text: string) => {
    setInitialChatMessage(_text);
    setSelectedSessionId(undefined); // new session
    setShowChat(true);
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setInitialChatMessage(undefined);
    setShowChat(true);
    setActiveTab('request');
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedSessionId(undefined);
    setInitialChatMessage(undefined);
    setShowChat(false); // go to IntentCaptureScreen to start fresh!
    setActiveTab('request');
  }, []);

  const renderScreen = () => {
    switch (activeTab) {
      case 'request':
        return showChat ? (
          <ChatScreen
            onBack={() => setShowChat(false)}
            onMenuPress={openSidebar}
            isSidebarOpen={isSidebarOpen}
            initialMessage={initialChatMessage}
            sessionId={selectedSessionId}
            userLocation={userLocation}
            onNavigateToExecution={() => handleTabPress('execution')}
          />
        ) : (
          <IntentCaptureScreen onSubmit={handleStartChat} onMenuPress={openSidebar} isSidebarOpen={isSidebarOpen} />
        );
      case 'discovery':
        return <DiscoveryScreen onMenuPress={openSidebar} isSidebarOpen={isSidebarOpen} />;
      case 'execution':
        return <ExecutionScreen onMenuPress={openSidebar} isSidebarOpen={isSidebarOpen} onNavigateToChat={() => { setActiveTab('request'); setShowChat(true); }} />;
      case 'tracking':
        return (
          <TrackingScreen
            onMenuPress={openSidebar}
            isSidebarOpen={isSidebarOpen}
            onOpenSession={(sessionId) => {
              setSelectedSessionId(sessionId);
              setInitialChatMessage(undefined);
              setShowChat(true);
              setActiveTab('request');
            }}
          />
        );
    }
  };

  return (
    <View style={styles.root}>
      {/* Desktop Persistent Sidebar */}
      {isDesktop && (
        <Sidebar
          visible={desktopOpen}
          onClose={() => {
            if (desktopOpen) closeSidebar();
            else openSidebar();
          }}
          isDesktop={true}
          activeTab={activeTab}
          onTabPress={handleTabPress}
          onOpenSearch={() => setSearchModalVisible(true)}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
        />
      )}

      <View style={styles.mainContent}>
        <View style={styles.screen}>{renderScreen()}</View>
        {!isDesktop && <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />}
      </View>

      {/* Mobile Slide-in Sidebar */}
      {!isDesktop && (
        <Sidebar
          visible={mobileOpen}
          onClose={closeSidebar}
          isDesktop={false}
          activeTab={activeTab}
          onTabPress={handleTabPress}
          onOpenSearch={() => setSearchModalVisible(true)}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
        />
      )}

      {/* Global Modals */}
      <SearchChatsModal 
        visible={isSearchModalVisible} 
        onClose={() => setSearchModalVisible(false)} 
        onSelectChat={handleSelectSession}
        onNewChat={handleNewChat}
      />
    </View>
  );
}

function createStyles(colors: any) { return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    flexDirection: 'row',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  screen: {
    flex: 1,
  },
}); }
