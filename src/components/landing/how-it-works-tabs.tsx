'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  UserPlus,
  Search,
  MessageSquare,
  Key,
  Users,
  Handshake,
  DoorOpen,
  Home,
  CalendarRange,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ListingType } from '@/lib/listings-data';

interface StepConfig {
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
}

const STEPS_BY_TYPE: Record<ListingType, StepConfig[]> = {
  replacement: [
    { icon: Search, titleKey: 'step1Title', descKey: 'step1Desc' },
    { icon: MessageSquare, titleKey: 'step2Title', descKey: 'step2Desc' },
    { icon: UserPlus, titleKey: 'step3Title', descKey: 'step3Desc' },
    { icon: Key, titleKey: 'step4Title', descKey: 'step4Desc' },
  ],
  roommate: [
    { icon: Search, titleKey: 'step1Title', descKey: 'step1Desc' },
    { icon: Users, titleKey: 'step2Title', descKey: 'step2Desc' },
    { icon: Handshake, titleKey: 'step3Title', descKey: 'step3Desc' },
    { icon: Home, titleKey: 'step4Title', descKey: 'step4Desc' },
  ],
  sublet: [
    { icon: Search, titleKey: 'step1Title', descKey: 'step1Desc' },
    { icon: MessageSquare, titleKey: 'step2Title', descKey: 'step2Desc' },
    { icon: CalendarRange, titleKey: 'step3Title', descKey: 'step3Desc' },
    { icon: DoorOpen, titleKey: 'step4Title', descKey: 'step4Desc' },
  ],
};

const TAB_ACTIVE_RING: Record<ListingType, string> = {
  replacement: 'border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400',
  roommate: 'border-violet-500/50 bg-violet-500/15 text-violet-600 dark:text-violet-400',
  sublet: 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

const STEP_ICON_COLOR: Record<ListingType, string> = {
  replacement: 'text-blue-500 border-blue-500/50 bg-blue-500/20',
  roommate: 'text-violet-500 border-violet-500/50 bg-violet-500/20',
  sublet: 'text-amber-500 border-amber-500/50 bg-amber-500/20',
};

const STEP_NUMBER_BG: Record<ListingType, string> = {
  replacement: 'bg-blue-500',
  roommate: 'bg-violet-500',
  sublet: 'bg-amber-500',
};

const TABS: ListingType[] = ['replacement', 'roommate', 'sublet'];

export function HowItWorksTabs() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<ListingType>('replacement');

  const tabLabel = (type: ListingType) => {
    const key = `landing.howItWorks.tab${type.charAt(0).toUpperCase() + type.slice(1)}` as const;
    return t(key);
  };

  const steps = STEPS_BY_TYPE[activeTab];

  return (
    <>
      {/* Tabs */}
      <div className="mx-auto mb-12 flex max-w-lg justify-center gap-2">
        {TABS.map((type) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              activeTab === type
                ? TAB_ACTIVE_RING[type]
                : 'border-border/50 text-muted-foreground hover:border-border hover:bg-secondary/50'
            }`}
          >
            {tabLabel(type)}
          </button>
        ))}
      </div>

      {/* Steps */}
      <div className="relative mx-auto max-w-5xl">
        <div className={`absolute left-0 right-0 top-12 hidden h-0.5 bg-border lg:block`} />

        <div key={activeTab} className="step-fade grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.titleKey} className="relative flex flex-col items-center text-center">
              <div
                className={`relative z-10 mb-4 flex h-24 w-24 items-center justify-center rounded-full border ${STEP_ICON_COLOR[activeTab]}`}
              >
                <step.icon className={`h-10 w-10 ${STEP_ICON_COLOR[activeTab].split(' ')[0]}`} />
                <span
                  className={`absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white ${STEP_NUMBER_BG[activeTab]}`}
                >
                  {index + 1}
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">
                {t(`landing.howItWorks.${activeTab}.${step.titleKey}`)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(`landing.howItWorks.${activeTab}.${step.descKey}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
