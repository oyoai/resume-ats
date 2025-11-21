class Contact {
  constructor(firstname, lastname,address,phone,email,links) {
    this.firstname = firstname;
    this.lastname = lastname;
    this.address = address;
    this.phone = phone;
    this.email = phone;
    this.links = links;
  }
}

class Experience {
  constructor(company, position,startyear,endyear,iscurrent,location) {
    this.company = company;
    this.position = position;
    this.startyear = startyear;
    this.endyear = endyear;
    this.iscurrent = iscurrent;
    this.location = location;
    this.bullets = bullets;

  }
}

class Education {
  constructor(institution, certification,startyear,endyear,iscurrent,location,bullets) {
    this.institution = institution;
    this.certification = certification;
    this.startyear = startyear;
    this.endyear = endyear;
    this.iscurrent = iscurrent;
    this.location = location;
    this.bullets = bullets;

  }
}

class Section {
  constructor(rawtext, certification,startyear,endyear,iscurrent,location,bullets) {
    this.rawtext = rawtext;
    }
}
class Summary {
  constructor(institution, certification,startyear,endyear,iscurrent,location,bullets) {
    this.institution = institution;
    this.certification = certification;
    this.startyear = startyear;
    this.endyear = endyear;
    this.iscurrent = iscurrent;
    this.location = location;
    this.bullets = bullets;

  }
}

class Resume {
  constructor(summary,contact, sections, bullets, rawtext,education,experience) {
    this.contact = contact;
    this.summary = summary;
    this.sections = sections;
    this.rawtext = rawtext;
    this.education = education;
    this.experience = experience;
    this.skills = skills;
  }
}
