#!/usr/bin/env python3
"""© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Normalize an authorized FCC availability CSV. Does not obtain/redistribute Fabric.
Produces JSON Lines keyed by exact FCC location ID, never inferred street routes.
"""
import argparse,csv,datetime,hashlib,json,math,pathlib,sys

def speed(value):
    if value in (None,''):return None
    n=float(value)
    if not math.isfinite(n) or n<0:raise ValueError('Invalid advertised speed')
    return n

def rows(csv_path,vintage):
    with csv_path.open(newline='',encoding='utf-8-sig') as handle:
        reader=csv.DictReader(handle)
        required={'location_id','technology','max_advertised_download_speed','max_advertised_upload_speed'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Expected FCC availability-download headers: '+', '.join(sorted(required)))
        for row in reader:
            if row['technology'].strip()!='50':continue
            location=row['location_id'].strip()
            if not location.isdigit():raise ValueError('Location ID must be a digit string')
            down=speed(row['max_advertised_download_speed']);up=speed(row['max_advertised_upload_speed'])
            brand=row.get('brand_name') or row.get('provider_name') or None
            key=(vintage,location,row.get('provider_id'),row.get('business_residential_code'),down,up)
            record_id=hashlib.sha256(json.dumps(key,separators=(',',':')).encode()).hexdigest()
            yield {'record_id':record_id,'record_kind':'reported_mass_market_fiber_availability','location_id':location,
                'provider_id':row.get('provider_id'),'brand_name':brand,'technology_code':50,
                'business_residential_code':row.get('business_residential_code'),
                'advertised_download_mbps':down,'advertised_upload_mbps':up,
                'advertised_download_gbps':None if down is None else down/1000,
                'advertised_upload_gbps':None if up is None else up/1000,
                'low_latency':row.get('low_latency'),'source_vintage':vintage,
                'source_url':'https://broadbandmap.fcc.gov/data-download',
                'serviceability':'provider_reported_at_fcc_location_id',
                'enterprise_capacity_gbps':None,'spare_capacity_gbps':None,
                'geometry':None,'route_geometry_inferred':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=pathlib.Path);p.add_argument('--vintage',required=True);p.add_argument('--output',required=True,type=pathlib.Path)
    a=p.parse_args();datetime.date.fromisoformat(a.vintage)
    # User selects a private destination; never silently put restricted records in public data/.
    if a.output.suffix not in ('.ndjson','.jsonl'):raise SystemExit('Output must be .ndjson or .jsonl')
    a.output.parent.mkdir(parents=True,exist_ok=True);temp=a.output.with_suffix(a.output.suffix+'.tmp');count=0
    try:
        with temp.open('w') as handle:
            for row in rows(a.input,a.vintage):handle.write(json.dumps(row,separators=(',',':'))+'\n');count+=1
        temp.replace(a.output)
    except Exception:
        temp.unlink(missing_ok=True);raise
    print(json.dumps({'fiber_availability_records':count,'output':str(a.output),'national_data_downloaded':False,'location_coordinates_joined':False}))
if __name__=='__main__':main()
