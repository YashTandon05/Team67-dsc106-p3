import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

const width = 960;
const height = 600;

const svg = d3.select("#map").attr("width", width).attr("height", height);
const g = svg.append('g');

const projection = d3.geoMercator().scale(140).translate([width/2, height/1.5]);
const path = d3.geoPath(projection);

const tooltip = d3.select("#tooltip")
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("font-size", "12px");

let worldData = null;
let csvData = {};
let currentYear = 2014;
let measure = 'absolute';
let colorScale = null;
let colorScaleAbsolute = null;
let colorScaleChange = null;

// Load and initialize data
async function loadData() {
    const [world, csv] = await Promise.all([
        d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
        d3.csv('data/cmip6_tas_country_annual.csv')
    ]);
    
    worldData = world;
    
    // CSV Data Processing
    csv.forEach(d => {
        const year = +d.year;
        const isoCode = String(d.iso_num);
        
        if (!csvData[year]) {
            csvData[year] = {};
        }
                      
        csvData[year][isoCode] = {
            country: d.country,
            value: d.avg_temp_absolute ? +d.avg_temp_absolute : null,
            change: d.avg_temp_change ? +d.avg_temp_change : null,
            percentChange: d.avg_temp_change ? +d.avg_temp_change : null,
        };
    });
    
    // Color Scales for both metrics
    const allValues = csv.filter(d => d.avg_temp_absolute).map(d => +d.avg_temp_absolute);
    const minValue = d3.min(allValues);
    const maxValue = d3.max(allValues);
    colorScaleAbsolute = d3.scaleSequential(d3.interpolateRdYlBu).domain([maxValue, minValue]);

    const allPercentChanges = [];
    Object.keys(csvData).forEach(year => {
        Object.keys(csvData[year]).forEach(isoCode => {
            const data = csvData[year][isoCode];
            if (data.percentChange !== null && !isNaN(data.percentChange)) {
                allPercentChanges.push(Math.abs(data.percentChange));
            }
        });
    });
    const maxPercentChange = d3.max(allPercentChanges);
    colorScaleChange = d3.scaleDiverging(d3.interpolateRdBu).domain([-maxPercentChange, 0, maxPercentChange]);
    
    // Local Storage for remembering settings
    // TODO : Add remembering year on slider
    if (localStorage.measure) {
        measure = localStorage.measure;
    } else {
        measure = 'absolute';
        localStorage.measure = measure;
    }
    colorScale = measure === 'absolute' ? colorScaleAbsolute : colorScaleChange;
    
    drawMap(currentYear);
    drawLegend();
    createYearSlider();
    createMeasureToggle();
}

loadData();

function drawLegend() {
    if (!colorScale) return;

    svg.selectAll(".legend").remove();
    
    const legendWidth = 300;
    const legendHeight = 20;
    const legendX = width - legendWidth - 20;
    const legendY = height - 40;
    
    const legend = svg.append("g").attr("class", "legend").attr("transform", `translate(${legendX}, ${legendY})`);
    
    const domain = colorScale.domain();
    const legendDomain = measure === 'absolute' ? domain : [domain[0], domain[2]];
    
    const legendScale = d3.scaleLinear().domain(legendDomain).range([0, legendWidth]);
    
    let legendAxis;
    if (measure === 'absolute') {
        legendAxis = d3.axisBottom(legendScale)
            .ticks(5)
            .tickFormat(d => d.toFixed(1) + "°C");
    } else {
        legendAxis = d3.axisBottom(legendScale)
            .ticks(5)
            .tickFormat(d => (d > 0 ? '+' : '') + d.toFixed(1) + "%");
    }
    
    const gradient = legend.append("defs")
        .append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");
    
    const numStops = 10;
    for (let i = 0; i <= numStops; i++) {
        let value;
        if (measure === 'absolute') {
            // Sequential scale: interpolate from max to min
            value = d3.interpolateNumber(domain[1], domain[0])(i / numStops);
        } else {
            // Diverging scale: interpolate from negative to positive through 0
            // Domain is [min, center, max] = [-maxPercentChange, 0, maxPercentChange]
            value = d3.interpolateNumber(domain[2], domain[0])(i / numStops);
        }
        gradient.append("stop")
            .attr("offset", `${(i / numStops) * 100}%`)
            .attr("stop-color", colorScale(value));
    }
    
    legend.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)")
        .style("stroke", "#000")
        .style("stroke-width", 1);
    
    legend.append("g")
        .attr("transform", `translate(0, ${legendHeight})`)
        .call(legendAxis);
    
    // Legend title based on measure
    const legendTitle = measure === 'absolute' 
        ? "Average Temperature (°C)" 
        : "Temperature Change (Δ)";
    
    legend.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", -5)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text(legendTitle);
}

function drawMap(year) {
    if (!worldData) return;
    
    const countries = topojson.feature(worldData, worldData.objects.countries);
    const yearData = csvData[year] || {};

    const countriesPath = g.selectAll('path.country').data(countries.features);
    
    countriesPath.exit().remove();
    
    const countriesEnter = countriesPath.enter()
        .append('path')
        .attr('class', 'country')
        .attr('d', path)
        .style("cursor", "pointer");
    
    const countriesUpdate = countriesEnter.merge(countriesPath).attr('d', path).attr('fill', d => {
            const isoCode = String(d.id);
            const data = yearData[isoCode];
            
            if (data && colorScale) {
                let valueToUse = null;
                if (measure === 'absolute') {
                    valueToUse = data.value;
                } else {
                    valueToUse = data.percentChange;
                }
                
                if (valueToUse !== null && !isNaN(valueToUse)) {
                    const color = colorScale(valueToUse);
                    return color;
                }
            }
            return '#ccc';
        }).attr('stroke', '#fff').attr('stroke-width', 0.5)
        .on('mouseover', function(event, d) {
            const isoCode = String(d.id);
            const data = yearData[isoCode];
            
            d3.select(this).attr('stroke', '#000').attr('stroke-width', 2);

            if (data) {
                let tooltipHtml = `<strong>${data.country}</strong><br/>Year: ${year}<br/>`;
                
                if (measure === 'absolute') {
                    tooltipHtml += `Temperature: ${data.value.toFixed(2)}°C`;
                    if (data.percentChange !== null && !isNaN(data.percentChange)) {
                        tooltipHtml += `<br/>Δ: ${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}%`;
                    }
                } else {
                    if (data.percentChange !== null && !isNaN(data.percentChange)) {
                        tooltipHtml += `Δ Temperature: ${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}%`;
                        tooltipHtml += `<br/>Temperature: ${data.value.toFixed(2)}°C`;
                    } else {
                        tooltipHtml += `Δ Temperature: N/A`;
                    }
                }
                
                tooltip
                    .style('opacity', 1)
                    .html(tooltipHtml)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            } else {
                tooltip
                    .style('opacity', 1)
                    .html(`
                        <strong>${d.properties.name || 'Unknown'}</strong><br/>
                        Year: ${year}<br/>
                        No data available
                    `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            }
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('stroke', '#fff')
                .attr('stroke-width', 0.5);
            tooltip.style('opacity', 0);
        })
        .on('click', function(event, d) {
            const isoCode = String(d.id);
            const data = yearData[isoCode];
            
            // TODO 
        });
}

function createYearSlider() {
    const yearSlider = d3.select("#yearSlider");
    const yearValue = d3.select("#yearValue");
    
    yearSlider.on("input", function() {
        currentYear = +this.value;
        yearValue.text(currentYear);
        drawMap(currentYear);
    });
}

function createMeasureToggle() {
    const select = document.querySelector('#measureSelect');
    
    select.value = measure;
    select.addEventListener('change', function(event) {
        measure = event.target.value;
        localStorage.measure = measure;
        
        colorScale = measure === 'absolute' ? colorScaleAbsolute : colorScaleChange;
        
        drawMap(currentYear);
        drawLegend();
    });
}


