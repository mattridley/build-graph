import { BuildGraphDashboard } from '@/components/buildgraph/dashboard'
import type { DashboardProject } from '@/components/buildgraph/types'
import { buildAtlasFixture } from '@/lib/demo/atlas'

export default function Home() {
  const atlas = buildAtlasFixture()
  const project: DashboardProject = {
    project: {
      id: atlas.project.id,
      slug: 'atlas',
      name: atlas.project.name,
      description: atlas.project.description,
      timezone: 'Europe/London',
      targetDate: atlas.project.targetDate,
    },
    scopeGroups: atlas.scopeGroups.map((group) => ({
      id: group.id,
      slug: group.slug,
      name: group.name,
      classification: group.classification,
    })),
    workItems: atlas.workItems.map((item) => ({
      id: item.id,
      scopeGroupId: item.scopeGroupId,
      kind: item.kind,
      status: item.status,
      title: item.title,
      description: item.description,
      size: item.size,
      progressPercent: item.progressPercent,
      sourceReference: item.sourceReference,
      graphX: item.graphX,
      graphY: item.graphY,
    })),
    dependencies: atlas.dependencies.map((dependency) => ({
      predecessorId: dependency.predecessorId,
      successorId: dependency.successorId,
    })),
    scenarios: atlas.scenarios.map((scenario) => ({
      id: scenario.id,
      slug: scenario.slug,
      name: scenario.name,
      description: scenario.description,
      excludedScopeGroupIds: scenario.excludedScopeGroupIds,
      resolvedBlockerIds: scenario.resolvedBlockerIds,
    })),
  }
  return <BuildGraphDashboard project={project} />
}
