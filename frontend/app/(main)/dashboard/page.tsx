"use client"

import { DashboardCards } from "./dashboard-cards"
import { DashboardTrendChart } from "./dashboard-trend-chart"
import { DashboardGradesFeed } from "./dashboard-grades-feed"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <DashboardCards />
      <div className="px-4 lg:px-6">
        <DashboardTrendChart />
      </div>
      <DashboardGradesFeed />
    </div>
  )
}
