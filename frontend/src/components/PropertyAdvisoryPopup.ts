/**
 * Property Advisory Popup Component (T036 - User Story 1)
 * 
 * Displays detailed property restriction information for heritage sites
 * and protected areas when clicked on the map.
 */

export interface PropertyRestriction {
  property_name: string;
  organization: string;
  restriction_category: 'HERITAGE_SITE' | 'SSSI_PROTECTED_AREAS' | string;
  policy_text?: string;
  contact_info?: string;
  policy_effective_date?: string;
}

export class PropertyAdvisoryPopup {
  /**
   * Generate HTML content for property advisory popup
   * 
   * Displays: property name, managing organization, policy summary (truncated to 200 chars),
   * contact information, and "Learn More" link functionality through expansion.
   * 
   * @param properties - Property restriction data from API
   * @returns HTML string for Leaflet popup
   * 
   * @example
   * const popup = PropertyAdvisoryPopup.create({
   *   property_name: "Stonehenge",
   *   organization: "English Heritage Trust",
   *   restriction_category: "HERITAGE_SITE",
   *   policy_text: "Drone flights require prior authorization...",
   *   contact_info: "permissions@english-heritage.org.uk"
   * });
   */
  static create(properties: PropertyRestriction): string {
    const isSSSI = properties.restriction_category === 'SSSI_PROTECTED_AREAS';
    const icon = isSSSI ? '🦋' : '🏛️';
    const bgColor = isSSSI ? '#DC2626' : '#FFA500';
    const label = isSSSI ? 'SSSI Protected Area' : 'Heritage Site';
    
    return `
      <div style="min-width: 280px; font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1f2937; text-align: left;">
          ${properties.property_name}
        </h3>
        <div style="background: ${bgColor}; color: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-weight: 600; font-size: 12px; text-align: left;">
          ${icon} ${label}
        </div>
        <table style="width: 100%; font-size: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #666; text-align: left;"><strong>Organization:</strong></td>
            <td style="padding: 4px 0; text-align: left;">${properties.organization}</td>
          </tr>
          ${this.renderPolicySection(properties, isSSSI)}
          ${this.renderContactSection(properties)}
          ${this.renderEffectiveDateSection(properties)}
        </table>
        ${this.renderAdvisoryDisclaimer(isSSSI)}
      </div>
    `;
  }

  /**
   * Render policy text section with truncation and "Learn More" expansion
   */
  private static renderPolicySection(properties: PropertyRestriction, isSSSI: boolean): string {
    if (!properties.policy_text) return '';
    
    const bgColor = isSSSI ? '#fee2e2' : '#fef3c7';
    const textColor = isSSSI ? '#7f1d1d' : '#92400e';
    const shouldTruncate = properties.policy_text.length > 200;
    const displayText = shouldTruncate 
      ? properties.policy_text.substring(0, 200) + '...' 
      : properties.policy_text;
    
    return `
      <tr>
        <td colspan="2" style="padding: 8px; background: ${bgColor}; border-radius: 4px; margin-top: 8px; font-size: 11px; color: ${textColor}; text-align: left;">
          <strong>Policy:</strong><br/>
          <span style="line-height: 1.4;">${displayText}</span>
          ${shouldTruncate ? '<br/><a href="#" style="color: inherit; font-weight: 600; text-decoration: underline;" onclick="alert(\'Full policy available on organization website\'); return false;">Learn More</a>' : ''}
        </td>
      </tr>
    `;
  }

  /**
   * Render contact information section
   */
  private static renderContactSection(properties: PropertyRestriction): string {
    if (!properties.contact_info) return '';
    
    // Check if contact info is an email
    const isEmail = properties.contact_info.includes('@');
    const contactDisplay = isEmail 
      ? `<a href="mailto:${properties.contact_info}" style="color: #2563eb; text-decoration: none;">${properties.contact_info}</a>`
      : properties.contact_info;
    
    return `
      <tr>
        <td style="padding: 4px 0; color: #666; text-align: left;"><strong>Contact:</strong></td>
        <td style="padding: 4px 0; text-align: left;">${contactDisplay}</td>
      </tr>
    `;
  }

  /**
   * Render policy effective date section
   */
  private static renderEffectiveDateSection(properties: PropertyRestriction): string {
    if (!properties.policy_effective_date) return '';
    
    const formattedDate = new Date(properties.policy_effective_date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    
    return `
      <tr>
        <td style="padding: 4px 0; color: #666; text-align: left;"><strong>Effective:</strong></td>
        <td style="padding: 4px 0; text-align: left;">${formattedDate}</td>
      </tr>
    `;
  }

  /**
   * Render advisory disclaimer to distinguish from legal airspace restrictions
   */
  private static renderAdvisoryDisclaimer(isSSSI: boolean): string {
    return `
      <div style="margin-top: 12px; padding: 10px; background: #f9fafb; border-left: 3px solid #9ca3af; font-size: 11px; color: #4b5563; text-align: left; line-height: 1.4;">
        <strong style="color: #374151;">ℹ️ Advisory Notice:</strong><br/>
        This is a property-based restriction, not a legal airspace restriction. 
        ${isSSSI ? 'Flying over SSSIs requires careful consideration due to environmental protection policies.' : 'Contact the managing organization for permission before flying.'}
      </div>
    `;
  }

  /**
   * Create combined popup with property info AND flight status
   * Used when checking a location that intersects with a property restriction
   * 
   * @param properties - Property restriction data
   * @param flightStatus - Flight status result ('permitted' | 'prohibited' | 'check-property-restrictions')
   * @param airspaceClear - Whether airspace is clear
   * @param zonesCount - Number of restriction zones at location
   * @returns HTML string combining property advisory with flight status
   */
  static createCombined(
    properties: PropertyRestriction,
    flightStatus: string,
    airspaceClear: boolean,
    zonesCount: number
  ): string {
    const isSSSI = properties.restriction_category === 'SSSI_PROTECTED_AREAS';
    const icon = isSSSI ? '🦋' : '🏛️';
    const bgColor = isSSSI ? '#DC2626' : '#FFA500';
    const policyBgColor = isSSSI ? '#fee2e2' : '#fef3c7';
    const policyTextColor = isSSSI ? '#7f1d1d' : '#92400e';
    
    // Property section
    const propertySection = `
      <div style="background: ${bgColor}; color: white; padding: 10px 12px; margin: -12px -12px 12px -12px; border-radius: 8px 8px 0 0;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-align: left;">
          ${icon} ${properties.property_name}
        </h3>
        <div style="font-size: 11px; margin-top: 4px; opacity: 0.9; text-align: left;">
          ${properties.organization}
        </div>
      </div>
      
      ${properties.policy_text ? `
        <div style="background: ${policyBgColor}; padding: 10px; border-radius: 4px; margin-bottom: 12px; text-align: left;">
          <div style="font-size: 11px; font-weight: 600; color: ${policyTextColor}; margin-bottom: 4px;">Policy:</div>
          <div style="font-size: 11px; color: ${policyTextColor}; line-height: 1.4;">
            ${properties.policy_text.substring(0, 250)}${properties.policy_text.length > 250 ? '...' : ''}
          </div>
        </div>
      ` : ''}
      
      ${properties.contact_info ? `
        <div style="font-size: 11px; color: #4b5563; margin-bottom: 12px; text-align: left;">
          <strong style="color: #374151;">Contact:</strong> ${properties.contact_info}
        </div>
      ` : ''}
    `;

    // Flight status section
    const statusColor = flightStatus === 'permitted' ? '#16a34a' 
                      : flightStatus === 'prohibited' ? '#dc2626' 
                      : '#f59e0b';
    
    const statusIcon = flightStatus === 'permitted' ? '✓' 
                     : flightStatus === 'prohibited' ? '✗' 
                     : '⚠️';
    
    const statusLabel = flightStatus === 'permitted' ? 'Flight Permitted' 
                      : flightStatus === 'prohibited' ? 'No Flight Permitted' 
                      : 'Check Property Policy';

    const flightSection = `
      <div style="padding: 10px 12px; background: ${statusColor}20; border-left: 4px solid ${statusColor}; margin-bottom: 8px; text-align: left;">
        <div style="font-weight: 600; color: ${statusColor}; font-size: 12px;">
          ${statusIcon} ${statusLabel}
        </div>
        <div style="font-size: 11px; color: #4b5563; margin-top: 4px;">
          ${airspaceClear ? 'Airspace: Clear' : `Airspace: Restricted (${zonesCount} zone${zonesCount !== 1 ? 's' : ''})`}
        </div>
      </div>
    `;

    return `
      <div style="min-width: 320px; max-width: 380px; font-family: system-ui, sans-serif; text-align: left;">
        ${propertySection}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        ${flightSection}
      </div>
    `;
  }
}
