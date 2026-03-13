import React, { useState, useEffect } from 'react';
import {
  LineChart,
  AreaChart,
  BarChart,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  ScatterChart,
  Scatter,
  Treemap,
  FunnelChart,
  Sankey,
  GaugeChart,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  PolarRadiusAxis
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Calendar,
  Activity,
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  Zap,
  Target,
  Database,
  Layers,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Download,
  Settings,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import '../styles/theme.css';

const DataVisualization = ({ data, type, title, subtitle, height = 400, interactive = true }) => {
  const [chartType, setChartType] = useState('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [showTooltip, setShowTooltip] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [selectedDataPoint, setSelectedDataPoint] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', 
    '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#a855f7', '#f43f5e'
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Custom tooltip for data visualization
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="mb-1">
              <p className="text-sm font-medium" style={{ color: entry.color }}>
                {entry.name}: {entry.name.includes('Amount') || entry.name.includes('Revenue') || entry.name.includes('Salary') || entry.name.includes('Value') ? 
                  formatCurrency(entry.value) : 
                  entry.name.includes('Percentage') || entry.name.includes('Rate') || entry.name.includes('Margin') ? 
                  formatPercentage(entry.value) : 
                  entry.value
                }
              </p>
              {entry.payload?.growth && (
                <p className="text-xs text-gray-500">
                  Growth: {formatPercentage(entry.payload.growth)}
                </p>
              )}
              {entry.payload?.variance && (
                <p className="text-xs text-gray-500">
                  Variance: {formatCurrency(entry.payload.variance)}
                </p>
              )}
              {entry.payload?.count && (
                <p className="text-xs text-gray-500">
                  Count: {entry.payload.count.toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Interactive chart click handler
  const handleChartClick = (data) => {
    if (interactive) {
      setSelectedDataPoint(data);
      // You can add more interactive features here
    }
  };

  // Render different chart types based on data and type
  const renderChart = () => {
    if (!data || data.length === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No data available</p>
          </div>
        </div>
      );
    }

    switch (type) {
      case 'line':
        return renderLineChart();
      case 'area':
        return renderAreaChart();
      case 'bar':
        return renderBarChart();
      case 'pie':
        return renderPieChart();
      case 'radial':
        return renderRadialChart();
      case 'composed':
        return renderComposedChart();
      case 'scatter':
        return renderScatterChart();
      case 'treemap':
        return renderTreemap();
      case 'gauge':
        return renderGaugeChart();
      case 'radar':
        return renderRadarChart();
      case 'funnel':
        return renderFunnelChart();
      default:
        return renderDefaultChart();
    }
  };

  const renderLineChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis 
          dataKey="name" 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
        />
        <YAxis 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
          tickFormatter={(value) => {
            if (title?.toLowerCase().includes('revenue') || title?.toLowerCase().includes('amount')) {
              return `${(value / 1000000).toFixed(1)}M`;
            }
            return value;
          }}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        {showLegend && <Legend />}
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke="#3b82f6" 
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 4 }}
          activeDot={{ r: 6 }}
          animationDuration={animationEnabled ? 1000 : 0}
        />
        {/* Additional lines if data has multiple series */}
        {data[0]?.value2 && (
          <Line 
            type="monotone" 
            dataKey="value2" 
            stroke="#10b981" 
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
            animationDuration={animationEnabled ? 1000 : 0}
          />
        )}
        {data[0]?.value3 && (
          <Line 
            type="monotone" 
            dataKey="value3" 
            stroke="#f59e0b" 
            strokeWidth={2}
            dot={{ fill: '#f59e0b', r: 4 }}
            activeDot={{ r: 6 }}
            animationDuration={animationEnabled ? 1000 : 0}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );

  const renderAreaChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis 
          dataKey="name" 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
        />
        <YAxis 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
          tickFormatter={(value) => {
            if (title?.toLowerCase().includes('revenue') || title?.toLowerCase().includes('amount')) {
              return `${(value / 1000000).toFixed(1)}M`;
            }
            return value;
          }}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        {showLegend && <Legend />}
        <Area 
          type="monotone" 
          dataKey="value" 
          stroke="#3b82f6" 
          fill="#3b82f6" 
          fillOpacity={0.6}
          strokeWidth={2}
          animationDuration={animationEnabled ? 1000 : 0}
        />
        {/* Additional areas if data has multiple series */}
        {data[0]?.value2 && (
          <Area 
            type="monotone" 
            dataKey="value2" 
            stroke="#10b981" 
            fill="#10b981" 
            fillOpacity={0.4}
            strokeWidth={2}
            animationDuration={animationEnabled ? 1000 : 0}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis 
          dataKey="name" 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
        />
        <YAxis 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
          tickFormatter={(value) => {
            if (title?.toLowerCase().includes('revenue') || title?.toLowerCase().includes('amount')) {
              return `${(value / 1000000).toFixed(1)}M`;
            }
            return value;
          }}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        {showLegend && <Legend />}
        <Bar 
          dataKey="value" 
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
          animationDuration={animationEnabled ? 1000 : 0}
        />
        {/* Additional bars if data has multiple series */}
        {data[0]?.value2 && (
          <Bar 
            dataKey="value2" 
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            animationDuration={animationEnabled ? 1000 : 0}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );

  const renderPieChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percentage }) => (
            <div>
              <div className="font-medium">{name}</div>
              <div className="text-xs text-gray-500">{formatPercentage(percentage)}</div>
            </div>
          )}
          outerRadius={screenSize === 'mobile' ? 60 : 80}
          fill="#8884d8"
          dataKey="value"
          animationDuration={animationEnabled ? 1000 : 0}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        {showTooltip && <Tooltip formatter={(value) => formatCurrency(value)} />}
        {showLegend && <Legend />}
      </RechartsPieChart>
    </ResponsiveContainer>
  );

  const renderRadialChart = () => {
    const radialData = data.map(item => ({
      name: item.name,
      value: item.value,
      fill: COLORS[data.indexOf(item) % COLORS.length]
    }));

    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="10%" outerRadius="80%" data={radialData}>
          <RadialBar 
            dataKey="value" 
            cornerRadius={10}
            fill="#8884d8"
            animationDuration={animationEnabled ? 1000 : 0}
          />
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          <Legend />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  };

  const renderComposedChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis 
          dataKey="name" 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
        />
        <YAxis 
          stroke="#6b7280"
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
          tickFormatter={(value) => {
            if (title?.toLowerCase().includes('revenue') || title?.toLowerCase().includes('amount')) {
              return `${(value / 1000000).toFixed(1)}M`;
            }
            return value;
          }}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        {showLegend && <Legend />}
        <Bar dataKey="value" fill="#3b82f6" />
        <Line type="monotone" dataKey="value2" stroke="#10b981" strokeWidth={2} />
        {data[0]?.value3 && <Line type="monotone" dataKey="value3" stroke="#f59e0b" strokeWidth={2} />}
        <Area type="monotone" dataKey="value4" fill="#8b5cf6" fillOpacity={0.3} />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const renderScatterChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis 
          type="number" 
          dataKey="x" 
          name="X Value"
          stroke="#6b7280"
        />
        <YAxis 
          type="number" 
          dataKey="y" 
          name="Y Value"
          stroke="#6b7280"
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />}
        <Scatter name="Data Points" data={data} fill="#3b82f6" />
      </ScatterChart>
    </ResponsiveContainer>
  );

  const renderTreemap = () => (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={data}
        dataKey="value"
        aspectRatio={screenSize === 'mobile' ? 4/3 : 16/9}
        stroke="#fff"
        fill="#8884d8"
        animationDuration={animationEnabled ? 1000 : 0}
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Treemap>
      {showTooltip && <Tooltip content={<CustomTooltip />} />}
    </ResponsiveContainer>
  );

  const renderGaugeChart = () => {
    const gaugeData = data.map(item => ({
      name: item.name,
      value: item.value,
      fill: COLORS[data.indexOf(item) % COLORS.length]
    }));

    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="90%" data={gaugeData}>
          <RadialBar 
            dataKey="value" 
            cornerRadius={10}
            fill="#8884d8"
            animationDuration={animationEnabled ? 1000 : 0}
          />
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          <Legend />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  };

  const renderRadarChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }} />
        <Radar 
          name="Value" 
          dataKey="value" 
          stroke="#3b82f6" 
          fill="#3b82f6" 
          fillOpacity={0.6}
          strokeWidth={2}
          animationDuration={animationEnabled ? 1000 : 0}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        {showLegend && <Legend />}
      </RadarChart>
    </ResponsiveContainer>
  );

  const renderFunnelChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart 
        data={data} 
        layout="horizontal"
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis type="number" tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }} />
        <YAxis 
          type="category" 
          dataKey="name" 
          tick={{ fontSize: screenSize === 'mobile' ? 10 : 12 }}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        <Bar 
          dataKey="value" 
          fill="#3b82f6"
          radius={[0, 8, 0, 0]}
          animationDuration={animationEnabled ? 1000 : 0}
        />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderDefaultChart = () => {
    // Auto-detect best chart type based on data characteristics
    if (data.length <= 5 && data[0]?.percentage) {
      return renderPieChart();
    } else if (data[0]?.x && data[0]?.y) {
      return renderScatterChart();
    } else if (data[0]?.subject) {
      return renderRadarChart();
    } else if (data.some(item => item.value2 || item.value3)) {
      return renderComposedChart();
    } else if (data.some(item => item.growth !== undefined)) {
      return renderAreaChart();
    } else {
      return renderBarChart();
    }
  };

  const handleChartTypeChange = (newType) => {
    setChartType(newType);
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  const handleExport = () => {
    // Export functionality
    const csvContent = data.map(row => 
      Object.keys(row).map(key => row[key]).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'chart-data'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Type Selector */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleChartTypeChange('line')}
              className={`p-2 rounded-lg transition-colors ${
                chartType === 'line' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Line Chart"
            >
              <LineChartIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleChartTypeChange('bar')}
              className={`p-2 rounded-lg transition-colors ${
                chartType === 'bar' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Bar Chart"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleChartTypeChange('area')}
              className={`p-2 rounded-lg transition-colors ${
                chartType === 'area' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Area Chart"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleChartTypeChange('pie')}
              className={`p-2 rounded-lg transition-colors ${
                chartType === 'pie' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Pie Chart"
            >
              <PieChart className="w-4 h-4" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowTooltip(!showTooltip)}
              className={`p-2 rounded-lg transition-colors ${
                showTooltip 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Toggle Tooltip"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className={`p-2 rounded-lg transition-colors ${
                showLegend 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Toggle Legend"
            >
              <Database className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-2 rounded-lg transition-colors ${
                showGrid 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Toggle Grid"
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAnimationEnabled(!animationEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                animationEnabled 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Toggle Animation"
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-1">
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExport}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <ResponsiveCard>
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading chart...</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
              <div className="text-center">
                <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <p className="text-sm text-red-600">Error loading chart</p>
              </div>
            </div>
          )}
          {renderChart()}
        </div>
      </ResponsiveCard>

      {/* Chart Info */}
      {selectedDataPoint && (
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-md font-semibold text-gray-900">Selected Data Point</h4>
              <p className="text-sm text-gray-600">
                {selectedDataPoint.name}: {formatCurrency(selectedDataPoint.value)}
              </p>
            </div>
            <button
              onClick={() => setSelectedDataPoint(null)}
              className="p-1 text-gray-500 hover:text-gray-700"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </ResponsiveCard>
      )}

      {/* Statistics */}
      {data && data.length > 0 && (
        <ResponsiveCard>
          <h4 className="text-md font-semibold text-gray-900 mb-4">Quick Statistics</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">
                {data.length}
              </p>
              <p className="text-sm text-gray-600">Data Points</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(Math.max(...data.map(d => d.value || 0)))}
              </p>
              <p className="text-sm text-gray-600">Max Value</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-blue-600">
                {formatCurrency(Math.min(...data.map(d => d.value || 0)))}
              </p>
              <p className="text-sm text-gray-600">Min Value</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-purple-600">
                {formatCurrency(data.reduce((sum, d) => sum + (d.value || 0), 0))}
              </p>
              <p className="text-sm text-gray-600">Total Value</p>
            </div>
          </div>
        </ResponsiveCard>
      )}
    </div>
  );
};

export default DataVisualization;
