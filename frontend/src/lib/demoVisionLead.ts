import { BusinessVertical, CustomerType, PriorityLevel } from './types';

export const VISION_DEMO_LEAD = {
  title: 'Automotive Brake Disc Vision Inspection System',
  customer_name: 'Brakes India Pvt Ltd',
  customer_type: 'Automotive' as CustomerType,
  business_vertical: 'Business Head' as BusinessVertical,
  expected_decision_date: '2026-09-30',
  priority: 'High' as PriorityLevel,

  customer_contact: 'K. R. Sundaram',
  customer_designation: 'GM — Plant Automation',
  customer_email: 'sundaram@brakesindia.com',
  customer_phone: '+91 94440 12345',
  customer_location: 'Chennai, Tamil Nadu',
  plant_location: 'Sriperumbudur Industrial Estate',

  requirement_summary: 'Inline 2D/3D vision inspection of brake discs for surface defects and dimensional accuracy.',
  detailed_requirement:
    'Customer requires an inline vision inspection cell after machining to detect cracks, porosity, and OD/ID dimensional deviation on brake discs. Rejects must be auto-diverted without stopping the line. Scope includes camera, lighting, PLC handshake, and reject handling.',
  application: '2D Surface Defect & Dimension Verification',
  industry_process: 'Machining Line Post-Cast Inspection',
  current_process: 'Manual visual inspection at end of line',
  expected_automation: 'Cognex/Keyence 2D cameras with PLC reject handling',
  customer_objective: 'Reduce escape defects below 50 PPM and remove operator dependency',
  expected_project_timeline: '16 weeks from PO',
  customer_target_date: '2026-12-15',

  production_quantity: '1200 discs / day',
  production_rate: '1200 parts / day',
  cycle_time: '18 sec / part',
  shift_pattern: '2 Shifts (16 Hours/Day)',
  operating_hours: '16 hours / day',
  existing_equipment: 'CNC machining line with conveyor outfeed',
  existing_automation: 'Siemens S7-1500 line PLC',
  integration_requirements: 'Handshake with existing Siemens PLC via Profinet',
  technical_requirements: 'Siemens S7-1500 PLC, Cognex 2D Vision Camera, ring lighting',
  machine_dimensions: '1800 x 1200 x 2100 mm cell envelope',
  payload: 'Brake disc 4.5 kg',
  accuracy_requirement: '± 0.05 mm dimension check',
  environment_conditions: 'Shop floor, oil mist, 15–40°C',
  technical_specifications:
    'FOV to cover 280 mm disc. Lighting to handle machined metallic surface. NG signal to line PLC within 200 ms.',
  technical_assumptions: 'Customer will provide sample OK/NG discs and clean dry air.',
  customer_dependencies: 'Sample parts, electrical 415V, compressed air',

  customer_budget: '₹ 45,00,000',
  estimated_opportunity_value: '₹ 50,00,000',
  currency: 'INR',
  expected_po_date: '2026-10-15',
  commercial_remarks: 'Target close Q3 FY26',
};
