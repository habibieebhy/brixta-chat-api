// server/locationManager.ts

export interface LocationData {
  cities: City[];
  defaultCity: string;
  defaultLocality: string;
}

export interface City {
  id: string;
  name: string;
  localities: Locality[];
}

export interface Locality {
  id: string;
  name: string;
}

export const LOCATION_DATA: LocationData = {
  defaultCity: 'guwahati',
  defaultLocality: 'ganeshguri',
  cities: [
    {
      id: 'guwahati',
      name: 'Guwahati',
      localities: [
        { id: 'ganeshguri', name: 'Ganeshguri' },
        { id: 'ganesh-mandir', name: 'Ganesh Mandir' },
        { id: 'kahilipara', name: 'Kahilipara' },
        { id: 'zoo_road', name: 'Zoo Road' },
        { id: 'beltola', name: 'Beltola' },
        { id: 'hatigaon', name: 'Hatigaon' },
      ]
    }
    // Add more cities here when needed
    // {
    //   id: 'dispur',
    //   name: 'Dispur', 
    //   localities: [
    //     { id: 'last_gate', name: 'Last Gate' },
    //     { id: 'gs_road', name: 'GS Road' }
    //   ]
    // }
  ]
};

export class LocationManager {
  
  // Get all location data
  static getLocationData(): LocationData {
    return LOCATION_DATA;
  }
  
  // Get all cities
  static getCities(): City[] {
    return LOCATION_DATA.cities;
  }
  
  // Get city by ID
  static getCityById(cityId: string): City | undefined {
    return LOCATION_DATA.cities.find(city => city.id === cityId);
  }
  
  // Get localities for a city
  static getLocalitiesByCity(cityId: string): Locality[] {
    const city = this.getCityById(cityId);
    return city ? city.localities : [];
  }
  
  // Get locality by ID within a city
  static getLocalityById(cityId: string, localityId: string): Locality | undefined {
    const city = this.getCityById(cityId);
    return city?.localities.find(locality => locality.id === localityId);
  }
  
  // Get default selections
  static getDefaults(): { city: City | undefined, locality: Locality | undefined } {
    const defaultCity = this.getCityById(LOCATION_DATA.defaultCity);
    const defaultLocality = defaultCity ? 
      this.getLocalityById(LOCATION_DATA.defaultCity, LOCATION_DATA.defaultLocality) : 
      undefined;
    
    return { city: defaultCity, locality: defaultLocality };
  }
  
  // Validate city and locality combination
  static isValidCombination(cityId: string, localityId: string): boolean {
    const city = this.getCityById(cityId);
    if (!city) return false;
    
    return city.localities.some(locality => locality.id === localityId);
  }
  
  // Get formatted location string
  static getFormattedLocation(cityId: string, localityId: string): string {
    const city = this.getCityById(cityId);
    const locality = this.getLocalityById(cityId, localityId);
    
    if (!city || !locality) return 'Unknown Location';
    
    return `${locality.name}, ${city.name}`;
  }
}