import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

// Custom bundle (plotly.js-dist-min, not the default react-plotly.js which
// pulls in the full plotly.js) -- same reasoning as StructureViewer/NGL:
// don't ship more than necessary. This is itself lazy-loaded from
// JobDetailPage for the same reason.
const Plot = createPlotlyComponent(Plotly)

interface GraphViewerProps {
  content: string
}

// .graph files are raw Plotly figure JSON ({data, layout}), matching the old
// dashboard's loadGraph() (job_report.js), which fed the same JSON straight
// into Plotly.newPlot -- no server-side templating, any Plotly trace type.
export function GraphViewer({ content }: GraphViewerProps) {
  let figure: { data: Plotly.Data[]; layout?: Partial<Plotly.Layout> }
  try {
    figure = JSON.parse(content)
  } catch (e) {
    return <p>Could not parse this file as a Plotly graph: {(e as Error).message}</p>
  }

  return (
    <Plot
      data={figure.data}
      layout={{ autosize: true, ...figure.layout }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
      config={{ editable: true }}
    />
  )
}
